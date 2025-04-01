// ========== CONFIGURATION ========== //
if (typeof window.PHISHBERT_CONFIG === 'undefined') {
    window.PHISHBERT_CONFIG = {
        highlightColor: '#D32F2F',
        scanInterval: 15000, // 15 seconds
        initialScanDelay: 3000, // 3 seconds
        throttleDelay: 1000, // 1 second
        warningClass: 'phishbert-persistent-warning'
    };
}

// ========== MAIN SCRIPT ========== //
(function() {
    // Track extension validity and resources
    let extensionContextValid = true;
    let observer;
    let scanIntervalId;
    let initialScanTimeout;
    const { warningClass } = PHISHBERT_CONFIG;

    // ========== NOTIFICATION SYSTEM ========== //
    const showPhishingAlert = () => {
        try {
            chrome.notifications.create('phishbert-alert', {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon-48.png'),
                title: 'PhishBERT Alert',
                message: 'Potential phishing email detected!',
                priority: 2,
                buttons: [{ title: 'View Email' }]
            });
        } catch (error) {
            console.error('Notification creation failed:', error);
        }
    };

    const handleNotificationClick = (notificationId) => {
        if (notificationId === 'phishbert-alert') {
            chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
                tabs[0] ? chrome.tabs.update(tabs[0].id, {active: true}) 
                       : chrome.tabs.create({url: 'https://mail.google.com'});
            });
        }
    };

    const setupNotificationHandler = () => {
        try {
            chrome.notifications.onClicked.removeListener(handleNotificationClick);
            chrome.notifications.onClicked.addListener(handleNotificationClick);
        } catch (error) {
            console.error('Notification handler setup failed:', error);
        }
    };

    // ========== DETECTION SYSTEM ========== //
    const phishingPatterns = {
        phrases: [
            /verify\s+your\s+account/i,
            /password\s+expiration/i,
            /urgent\s+action\s+required/i,
            /account\s+suspension/i,
            /click\s+below\s+to\s+login/i,
            /your\s+account\s+has\s+been\s+compromised/i,
            /immediate\s+attention\s+needed/i,
            /security\s+alert/i,
            /account\s+verification/i,
            /suspicious\s+login/i
        ],
        links: [
            /https?:\/\/bit\.ly\/\w+/i,
            /https?:\/\/tinyurl\.com\/\w+/i,
            /\[http[^\]]+\]\([^)]+\)/i,
            /https?:\/\/[^\s]+@[^\s]+/i,
            /https?:\/\/[^\/]+\/login/i,
            /https?:\/\/(?!yourdomain\.com)[^\/]+\/account/i
        ],
        safePatterns: [
            /@(gmail|yahoo|outlook|company)\.com$/i,
            /(linkedin|twitter|facebook)\.com/i,
            /job\s+alert/i,
            /newsletter/i,
            /notification/i,
            /digest/i
        ]
    };

    const detectSuspiciousPatterns = (text, sender) => {
        if (sender && phishingPatterns.safePatterns.some(p => p.test(sender))) {
            return false;
        }
        return phishingPatterns.phrases.some(p => p.test(text)) || 
               phishingPatterns.links.some(p => p.test(text));
    };

    // ========== PERSISTENT HIGHLIGHTING SYSTEM ========== //
    const createWarningElement = () => {
        const warning = document.createElement('div');
        warning.className = warningClass;
        warning.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 8px 0;
            padding: 12px;
            background: rgba(211, 47, 47, 0.15);
            border-left: 4px solid ${PHISHBERT_CONFIG.highlightColor};
            border-radius: 0 4px 4px 0;
            color: ${PHISHBERT_CONFIG.highlightColor};
            position: relative;
            z-index: 1000;
        `;
        warning.innerHTML = `
            <img src="${chrome.runtime.getURL('icons/warning.png')}" 
                 style="width:20px;height:20px;">
            <span style="font-weight:bold;font-size:13px;">
                ⚠️ POTENTIAL PHISHING EMAIL DETECTED
            </span>
        `;
        return warning;
    };

    const highlightPhishing = (emailElement) => {
        if (!extensionContextValid || emailElement.classList.contains(warningClass)) return;

        // Mark the email and store its identifier
        emailElement.classList.add(warningClass);
        const emailId = `phishbert-${Date.now()}`;
        emailElement.setAttribute('data-phishbert-id', emailId);

        // Find the most stable container for our warning
        const emailContainer = emailElement.closest('.BltHke, .nH, [role="row"]') || emailElement;
        const warning = createWarningElement();
        emailContainer.insertBefore(warning, emailContainer.firstChild);

        // Set up protection against Gmail's DOM changes
        const observer = new MutationObserver((mutations) => {
            if (!emailContainer.contains(warning)) {
                emailContainer.insertBefore(warning, emailContainer.firstChild);
            }
        });
        observer.observe(emailContainer, { childList: true, subtree: true });
        emailElement._phishbertObserver = observer;

        // Notification and storage
        showPhishingAlert();
        chrome.runtime.sendMessage({ action: "updateBadge", type: "increment" })
            .catch(console.debug);

        chrome.storage.local.get(['phishbertMarkedEmails'], (result) => {
            const markedEmails = result.phishbertMarkedEmails || [];
            markedEmails.push({
                id: emailId,
                selector: getElementSelector(emailElement),
                timestamp: Date.now(),
                subject: emailElement.querySelector('.bog span, .bqe')?.textContent.trim() || '',
                sender: emailElement.querySelector('.zF')?.getAttribute('email') || ''
            });
            chrome.storage.local.set({ phishbertMarkedEmails: markedEmails });
        });
    };

    const getElementSelector = (el) => {
        const path = [];
        while (el && path.length < 6) { // Limit depth for stability
            let selector = el.tagName.toLowerCase();
            if (el.id) {
                selector += `#${el.id}`;
            } else if (el.className && typeof el.className === 'string') {
                selector += `.${el.className.split(' ')[0]}`;
            }
            path.unshift(selector);
            el = el.parentElement;
        }
        return path.join(' > ');
    };

    // ========== SCANNING SYSTEM ========== //
    const scanEmails = () => {
        if (!extensionContextValid) return;
        
        try {
            document.querySelectorAll(`[role="row"]:not(.${warningClass})`).forEach(email => {
                const subject = email.querySelector('.bog span, .bqe')?.textContent.trim() || '';
                const body = email.querySelector('.y2, .yP')?.textContent.trim() || '';
                const sender = email.querySelector('.zF')?.getAttribute('email') || '';

                if (detectSuspiciousPatterns(`${subject} ${body}`, sender)) {
                    highlightPhishing(email);
                    return;
                }

                if (subject.length > 5 && !subject.match(/^(Re:|Fw:|Automatic reply)/i)) {
                    chrome.runtime.sendMessage(
                        { action: "predict", text: subject },
                        (response) => {
                            if (!chrome.runtime.lastError && response?.prediction === 1) {
                                highlightPhishing(email);
                            }
                        }
                    );
                }
            });
        } catch (error) {
            console.error('Scan error:', error);
            extensionContextValid = false;
        }
    };

    // ========== EXTENSION MANAGEMENT ========== //
    const cleanupExtension = () => {
        extensionContextValid = false;
        if (observer) observer.disconnect();
        if (scanIntervalId) clearInterval(scanIntervalId);
        if (initialScanTimeout) clearTimeout(initialScanTimeout);
        chrome.notifications.onClicked.removeListener(handleNotificationClick);
        
        // Cleanup all marked emails
        document.querySelectorAll(`.${warningClass}`).forEach(email => {
            if (email._phishbertObserver) {
                email._phishbertObserver.disconnect();
            }
        });
    };

    const handleExtensionMessage = (message, sender, sendResponse) => {
        if (message === 'extensionContextInvalid') {
            cleanupExtension();
        }
        if (message.action === 'ping') {
            sendResponse({ status: "ready", valid: extensionContextValid });
            return true;
        }
        if (message.action === 'restore_warnings') {
            restorePersistentWarnings();
        }
    };

    const restorePersistentWarnings = () => {
        chrome.storage.local.get(['phishbertMarkedEmails'], (result) => {
            result.phishbertMarkedEmails?.forEach(email => {
                try {
                    const element = document.querySelector(email.selector);
                    if (element && !element.classList.contains(warningClass)) {
                        highlightPhishing(element);
                    }
                } catch (e) {
                    console.debug('Could not restore warning:', e);
                }
            });
        });
    };

    // ========== INITIALIZATION ========== //
    const initializeExtension = () => {
        // 1. Setup notification handler
        setupNotificationHandler();

        // 2. Configure scanning with throttling
        let isScanning = false;
        const throttledScan = () => {
            if (!isScanning) {
                isScanning = true;
                scanEmails();
                setTimeout(() => isScanning = false, PHISHBERT_CONFIG.throttleDelay);
            }
        };

        // 3. Start scanning
        initialScanTimeout = setTimeout(() => {
            throttledScan();
            scanIntervalId = setInterval(throttledScan, PHISHBERT_CONFIG.scanInterval);
            restorePersistentWarnings(); // Restore any existing warnings
        }, PHISHBERT_CONFIG.initialScanDelay);

        // 4. Watch for new emails and view changes
        observer = new MutationObserver((mutations) => {
            throttledScan();
            // Check for view changes that might need warning restoration
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    restorePersistentWarnings();
                }
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false
        });

        // 5. Setup message handler
        chrome.runtime.onMessage.addListener(handleExtensionMessage);
    };

    // Start the extension when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }
})();
     document.getElementById('manualScan').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
            url: ["*://mail.google.com/*"]
        });

        if (!tab) {
            alert("Please open Gmail first!");
            window.close();
            return;
        }

        // Check if content script is already injected
        let contentScriptInjected = false;
        try {
            const response = await chrome.tabs.sendMessage(tab.id, {action: "ping"});
            contentScriptInjected = !!response;
        } catch (e) {
            contentScriptInjected = false;
        }

        // Inject content script if needed
        if (!contentScriptInjected) {
            try {
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['content.js']
                });
                // Add slight delay for script initialization
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error("Injection failed:", error);
                alert("Failed to initialize scanner. Please refresh Gmail and try again.");
                window.close();
                return;
            }
        }

        // Send scan message with retry logic
        let retries = 3;
        while (retries > 0) {
            try {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: "manual_scan",
                    timestamp: Date.now()
                });
                console.log("Scan completed:", response);
                window.close();
                return;
            } catch (error) {
                retries--;
                if (retries === 0) {
                    console.error("Final scan attempt failed:", error);
                    alert("Scanner failed to respond. Please refresh Gmail and try again.");
                } else {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
    } catch (error) {
        console.error("PhishBERT error:", error);
        alert("An unexpected error occurred. Please try again.");
    }
    window.close();
});
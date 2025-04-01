// Cache for predictions
const predictionCache = new Map();
let badgeCount = 0;

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
    chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: "extensionUpdated"
            });
        });
    });
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        switch (request.action) {
            case "predict":
                if (predictionCache.has(request.text)) {
                    sendResponse({ prediction: predictionCache.get(request.text) });
                    return true;
                }

                fetch("http://localhost:5000/predict", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: request.text })
                })
                .then(res => res.json())
                .then(data => {
                    predictionCache.set(request.text, data.prediction);
                    sendResponse(data);
                })
                .catch(error => {
                    console.error("Prediction failed:", error);
                    sendResponse({ prediction: 0 }); // Fail safe
                });
                return true;

            case "updateBadge":
                if (request.type === "increment") {
                    badgeCount++;
                } else if (request.type === "reset") {
                    badgeCount = 0;
                }
                chrome.action.setBadgeText({ text: badgeCount > 0 ? badgeCount.toString() : '' });
                chrome.action.setBadgeBackgroundColor({ color: '#d32f2f' });
                sendResponse({ status: "updated", count: badgeCount });
                break;

            case "ping":
                sendResponse({ status: "alive" });
                break;

            default:
                sendResponse({ status: "ignored" });
        }
    } catch (error) {
        console.error("Message handling error:", error);
        sendResponse({ status: "error", error: error.message });
    }
    return true;
});

// Clear cache periodically
setInterval(() => {
    predictionCache.clear();
}, 3600000); // Every hour
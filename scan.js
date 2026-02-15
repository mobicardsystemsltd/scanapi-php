// ===================== MOBICARD SCAN CORE FUNCTIONALITY =====================
// This is a pure JavaScript implementation for integrating card scanning
// into existing applications.

// REQUIRED HTML ELEMENTS:
// <video id="camera_preview" autoplay playsinline></video>
// <canvas id="capture_canvas" style="display:none;"></canvas>
// <div class="scan-hint" id="scan_hint">Align card inside the frame</div>
// <div class="scan-line"></div>
// <div class="scan-frame"></div>
// <div class="scan-loader" id="scan_loader">Scanning… Please hold steady</div>
// <button id="capture_btn">Capture Now</button>

// REQUIRED PARAMETERS (set these from your server-side response):
// const mobicard_scan_card_url = "YOUR_SCAN_CARD_URL_FROM_API";
// const mobicard_transaction_access_token = "YOUR_TRANSACTION_ACCESS_TOKEN";
// const mobicard_token_id = "YOUR_TOKEN_ID";

// ========== DEBUG CONFIGURATION ==========
const DEBUG_MODE = true; // true = debug on, false = debug off

// Debug logging function
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log('[Mobicard Debug]', ...args);
    }
}

// Debug error logging function
function debugError(...args) {
    if (DEBUG_MODE) {
        console.error('[Mobicard Error]', ...args);
    }
}
// ========== END DEBUG CONFIG ==========

// Initialize variables
const video = document.getElementById('camera_preview');
const canvas = document.getElementById('capture_canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const scan_hint = document.getElementById('scan_hint');
const scan_loader = document.getElementById('scan_loader');
const scan_frame = document.querySelector('.scan-frame');
const scan_line = document.querySelector('.scan-line');

let last_frame = null;
let stable_counter = 0;
let auto_locked = false;
let scan_paused = false;
let idle_timer = null;
let quality_check_interval = null;
let last_submit_time = Date.now();
let initial_capture_and_submit_flag = 0;
let autoSubmitActive = true;
let autoSubmitTimeoutIds = [];
let retryCount = 0;
const MAX_RETRIES = 12;
let cameraStream = null;

// ================= CAMERA INITIALIZATION =================
function initCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        debugError('Camera API not supported');
        alert('Camera access is not supported by your browser.');
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        } 
    })
    .then(stream => {
        cameraStream = stream;
        video.srcObject = stream;
        resetIdleTimer();
        adjustScanFrame();
        
        // Start quality checking after camera is ready
        setTimeout(() => {
            quality_check_interval = setInterval(check_frame_quality, 700);
        }, 1000);
    })
    .catch(error => {
        debugError('Camera access error:', error);
        alert('Camera access denied or error occurred. Please allow camera permissions.');
    });
}

// ================= SCAN FRAME ADJUSTMENT =================
function adjustScanFrame() {
    if (!scan_frame) return;
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        scan_frame.style.width = '92%';
        scan_frame.style.height = '36%';
    } else {
        scan_frame.style.width = '67%';
        scan_frame.style.height = '45%';
    }
}

// ================= CAMERA CONTROL FUNCTIONS =================
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
            track.stop();
        });
        cameraStream = null;
        video.srcObject = null;
    }
}

function cleanupAllTimers() {
    if (quality_check_interval) {
        clearInterval(quality_check_interval);
        quality_check_interval = null;
    }
    
    if (idle_timer) {
        clearTimeout(idle_timer);
        idle_timer = null;
    }
    
    autoSubmitTimeoutIds.forEach(timeoutId => {
        clearTimeout(timeoutId);
    });
    autoSubmitTimeoutIds = [];
}

// ================= IDLE TIMER MANAGEMENT =================
function resetIdleTimer() {
    if (idle_timer) clearTimeout(idle_timer);
    idle_timer = setTimeout(showLockScreen, 45000); // 45 seconds
}

function showLockScreen() {
    retryCount = MAX_RETRIES;
    stopCamera();
    cleanupAllTimers();
    scan_paused = true;
    
    if (scan_line) {
        scan_line.style.animationPlayState = 'paused';
        scan_line.style.opacity = '0.3';
    }
    
    // Trigger lock screen event
    document.dispatchEvent(new CustomEvent('mobicard:lockScreen', {
        detail: { show: true }
    }));
}

function hideLockScreen() {
    scan_paused = false;
    
    if (scan_line) {
        scan_line.style.animationPlayState = 'running';
        scan_line.style.opacity = '1';
    }
    
    // Trigger lock screen event
    document.dispatchEvent(new CustomEvent('mobicard:lockScreen', {
        detail: { show: false }
    }));
    
    // Restart camera
    if (!cameraStream) {
        initCamera();
    } else {
        if (!quality_check_interval) {
            quality_check_interval = setInterval(check_frame_quality, 700);
        }
        resetIdleTimer();
    }
}

// ================= QUALITY CHECKING =================
function check_frame_quality() {
    if (scan_paused || !video || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Motion detection
    if (last_frame) {
        let diff = 0;
        for (let i = 0; i < frame.data.length; i += 40) {
            diff += Math.abs(frame.data[i] - last_frame.data[i]);
        }

        // Initial auto-submit sequence
        if (initial_capture_and_submit_flag === 0) {
            initial_capture_and_submit_flag++;
            
            setTimeout(() => {
                for (let i = 0; i < 5; i++) {
                    (function(iteration) {
                        const timeoutId = setTimeout(() => {
                            if (autoSubmitActive && retryCount < MAX_RETRIES) {
                                debugLog(`Auto-capture iteration ${iteration + 1}/5`);
                                capture_and_submit();
                            }
                        }, iteration * 2000);
                        
                        autoSubmitTimeoutIds.push(timeoutId);
                    })(i);
                }
            }, 1000);
        }

        if (diff > 50000) return bad("Hold your camera steady…");
    }
    last_frame = frame;

    // Blur detection
    let variance = 0;
    for (let i = 0; i < frame.data.length; i += 40) {
        variance += Math.abs(frame.data[i] - frame.data[i+4]);
    }
    if (variance < 20000) return bad("Move closer or improve focus…");

    // Glare detection
    let bright = 0;
    for (let i = 0; i < frame.data.length; i += 40) {
        if (frame.data[i] > 245 && frame.data[i+1] > 245 && frame.data[i+2] > 245) bright++;
    }
    if (bright > 2000) return bad("Reduce glare / tilt card slightly…");

    // Edge detection
    let edges = 0;
    for (let i = 0; i < frame.data.length; i += 40) {
        if (Math.abs(frame.data[i] - frame.data[i+4]) > 20) edges++;
    }
    if (edges < 1000) return bad("Align the card fully inside the frame…");

    // Quality passed
    stable_counter++;
    if (scan_hint) scan_hint.innerText = "Perfect — hold still…";
    if (scan_frame) {
        scan_frame.classList.add('locked');
        scan_frame.classList.remove('bad');
    }

    // Auto-submit when stable
    if (stable_counter >= 2 && stable_counter <= 60 && !auto_locked) {
        auto_locked = true;
        capture_and_submit();
    }
}

function bad(msg) {
    stable_counter = 0;
    if (scan_hint) scan_hint.innerText = msg;
    if (scan_frame) {
        scan_frame.classList.remove('locked');
        scan_frame.classList.add('bad');
    }
}

// ================= CAPTURE AND CROP =================
function capture_and_submit() {
    if (scan_paused) return;
    
    last_submit_time = Date.now();
    
    if (scan_loader) {
        scan_loader.style.display = 'block';
    }

    const w = canvas.width;
    const h = canvas.height;
    const scanFrame = document.querySelector('.scan-frame');
    
    if (!scanFrame) {
        debugError('Scan frame element not found');
        return;
    }

    const rect = scanFrame.getBoundingClientRect();
    const container = document.querySelector('.camera-container') || document.body;
    const containerRect = container.getBoundingClientRect();
    
    // Calculate crop coordinates
    const crop_x = (rect.left - containerRect.left) / containerRect.width * w;
    const crop_y = (rect.top - containerRect.top) / containerRect.height * h;
    const crop_w = rect.width / containerRect.width * w;
    const crop_h = rect.height / containerRect.height * h;

    const crop_canvas = document.createElement('canvas');
    crop_canvas.width = crop_w;
    crop_canvas.height = crop_h;
    const crop_ctx = crop_canvas.getContext('2d');

    crop_ctx.drawImage(canvas, crop_x, crop_y, crop_w, crop_h, 0, 0, crop_w, crop_h);

    crop_canvas.toBlob(blob => {
        submit_form_data(blob);
    }, 'image/jpeg', 0.92);
}

// ================= API SUBMISSION =================
function submit_form_data(file_blob) {
    if (retryCount >= MAX_RETRIES) {
        setTimeout(showLockScreen, 20);
        return;
    }
    
    if (!mobicard_scan_card_url || !mobicard_transaction_access_token || !mobicard_token_id) {
        debugError('Missing required API parameters');
        alert('Missing required configuration. Please check your setup.');
        return;
    }
    
    const formData = new FormData();
    formData.append('mobicard_scan_card_photo', file_blob);
    formData.append('mobicard_transaction_access_token', mobicard_transaction_access_token);
    formData.append('mobicard_token_id', mobicard_token_id);

    $.ajax({
        url: mobicard_scan_card_url,
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function (resp) {
            // Pause scanning animation
            if (scan_line) {
                scan_line.style.animationPlayState = 'paused';
                scan_line.style.opacity = '0.3';
            }
            
            try { 
                if (typeof resp === 'string') resp = JSON.parse(resp); 
            } catch(e) {
                debugError('JSON parse error:', e);
            }

            if (scan_loader) {
                scan_loader.style.display = 'none';
            }
            
            auto_locked = false;
            stable_counter = 0;

            if (resp && resp.status === 'SUCCESS') {
                autoSubmitActive = false;
                retryCount = MAX_RETRIES;
                
                // Clear auto-submit timeouts
                autoSubmitTimeoutIds.forEach(timeoutId => {
                    clearTimeout(timeoutId);
                });
                autoSubmitTimeoutIds = [];

                // Dispatch success event with response data
                document.dispatchEvent(new CustomEvent('mobicard:scanSuccess', {
                    detail: resp
                }));
                
                showLockScreen();
                
            } else {
                retryCount++;
                
                if (retryCount < MAX_RETRIES) {
                    debugLog(`Retrying... attempt ${retryCount}/${MAX_RETRIES}`);
                    setTimeout(() => {
                        capture_and_submit();
                    }, 4000);
                } else {
                    if (scan_loader) {
                        scan_loader.style.display = 'block';
                        scan_loader.innerText = 'Card not detected. Please try again.';
                        scan_loader.style.color = 'red';
                    }
                    
                    setTimeout(() => {
                        showLockScreen();
                    }, 1000);
                }
                
                // Resume scanning animation
                if (scan_line) {
                    scan_line.style.animationPlayState = 'running';
                    scan_line.style.opacity = '1';
                }
                
                scan_paused = false;
            }
        },
        error: function (xhr, status, error) {
            // Handle rate limiting
            if (xhr.status === 429) {
                stopCamera();
                cleanupAllTimers();
                showLockScreen();
                debugError('Rate limit exceeded');
                
                document.dispatchEvent(new CustomEvent('mobicard:rateLimit', {
                    detail: { message: 'Too many requests. Please wait.' }
                }));
                return;
            }
            
            if (scan_loader) {
                scan_loader.style.display = 'none';
            }
            
            auto_locked = false;
            stable_counter = 0;
            
            retryCount++;
            
            if (retryCount < MAX_RETRIES) {
                debugLog(`Retrying after error... attempt ${retryCount}/${MAX_RETRIES}`);
                setTimeout(() => {
                    capture_and_submit();
                }, 4000);
            } else {
                if (scan_loader) {
                    scan_loader.style.display = 'block';
                    scan_loader.innerText = 'Upload failed. Please check connection and try again.';
                    scan_loader.style.color = 'red';
                }
                
                setTimeout(showLockScreen, 2000);
            }
            
            // Resume scanning animation
            if (scan_line) {
                scan_line.style.animationPlayState = 'running';
                scan_line.style.opacity = '1';
            }
            
            scan_paused = false;
            
            // Clear auto-submit timeouts
            autoSubmitTimeoutIds.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            autoSubmitTimeoutIds = [];
            
            // Dispatch error event
            document.dispatchEvent(new CustomEvent('mobicard:scanError', {
                detail: { xhr, status, error }
            }));
        }
    });
}

// ================= UPLOAD FUNCTIONALITY =================
function submit_form_data_upload(file_blob) {
    if (!mobicard_scan_card_url || !mobicard_transaction_access_token || !mobicard_token_id) {
        debugError('Missing required API parameters for upload');
        alert('Missing required configuration. Please check your setup.');
        return;
    }
    
    const formData = new FormData();
    formData.append('mobicard_scan_card_photo', file_blob);
    formData.append('mobicard_transaction_access_token', mobicard_transaction_access_token);
    formData.append('mobicard_token_id', mobicard_token_id);

    $.ajax({
        url: mobicard_scan_card_url,
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function (resp) {
            try { 
                if (typeof resp === 'string') resp = JSON.parse(resp); 
            } catch(e) {
                debugError('JSON parse error:', e);
            }

            // Handle status code 430 - session expired
            if (resp && resp.status_code === '430') {
                debugError('Status code 430 received - session expired');
                document.dispatchEvent(new CustomEvent('mobicard:sessionExpired'));
                return;
            }
            
            // Handle other error status codes
            if (resp && resp.status_code && resp.status_code !== '200' && resp.status_code !== 'SUCCESS') {
                debugError(`Upload failed with status code: ${resp.status_code}`);
                document.dispatchEvent(new CustomEvent('mobicard:uploadError', {
                    detail: { 
                        status_code: resp.status_code,
                        message: resp.status_message || 'Unknown error'
                    }
                }));
                return;
            }

            if (resp && resp.status === 'SUCCESS') {
                debugLog('Upload API Response:', resp);
                
                // Dispatch success event
                document.dispatchEvent(new CustomEvent('mobicard:uploadSuccess', {
                    detail: resp
                }));
                
                showLockScreen();
            } else {
                document.dispatchEvent(new CustomEvent('mobicard:uploadError', {
                    detail: { message: "We couldn't read your card clearly. Please try again." }
                }));
            }
        },
        error: function (xhr, status, error) {
            // Handle status 430 in error response
            if (xhr.status === 430) {
                debugError('Status 430 received - session expired');
                document.dispatchEvent(new CustomEvent('mobicard:sessionExpired'));
                return;
            }
            
            debugError('Upload AJAX error:', status, error);
            document.dispatchEvent(new CustomEvent('mobicard:uploadError', {
                detail: { 
                    status: xhr.status,
                    error: error,
                    message: "Upload failed. Please check your connection and try again."
                }
            }));
        }
    });
}

// ================= EVENT LISTENERS SETUP =================
function setupEventListeners() {
    // Manual capture button
    const captureBtn = document.getElementById('capture_btn');
    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            resetIdleTimer();
            scan_paused = true;
            capture_and_submit();
        });
    }
    
    // Upload functionality
    const uploadInput = document.getElementById('upload_input');
    const uploadSubmitBtn = document.getElementById('upload_submit_btn');
    
    if (uploadSubmitBtn && uploadInput) {
        uploadSubmitBtn.addEventListener('click', () => {
            setTimeout(showLockScreen, 20);
            
            const file = uploadInput.files[0];
            if (!file) {
                alert("Please select a file first.");
                return;
            }
            
            submit_form_data_upload(file);
        });
    }
    
    // User activity tracking for idle timer
    ['click', 'mousemove', 'keypress', 'touchstart'].forEach(event => {
        document.addEventListener(event, resetIdleTimer);
    });
}

// ================= PUBLIC API =================
const MobicardScanner = {
    // Initialize the scanner
    init: function(config = {}) {
        debugLog('Initializing Mobicard Scanner...');
        
        // Set configuration
        if (config.scanCardUrl) window.mobicard_scan_card_url = config.scanCardUrl;
        if (config.transactionAccessToken) window.mobicard_transaction_access_token = config.transactionAccessToken;
        if (config.tokenId) window.mobicard_token_id = config.tokenId;
        
        // Initialize camera and setup
        initCamera();
        setupEventListeners();
        
        debugLog('Mobicard Scanner initialized successfully');
        return true;
    },
    
    // Start scanning
    start: function() {
        debugLog('Starting scanner...');
        scan_paused = false;
        hideLockScreen();
    },
    
    // Stop scanning
    stop: function() {
        debugLog('Stopping scanner...');
        scan_paused = true;
        stopCamera();
        cleanupAllTimers();
    },
    
    // Capture manually
    capture: function() {
        debugLog('Manual capture triggered');
        resetIdleTimer();
        scan_paused = true;
        capture_and_submit();
    },
    
    // Upload file
    upload: function(file) {
        if (!file) {
            debugError('No file provided for upload');
            return false;
        }
        
        debugLog('Uploading file:', file.name);
        submit_form_data_upload(file);
        return true;
    },
    
    // Set API credentials
    setCredentials: function(scanCardUrl, transactionAccessToken, tokenId) {
        window.mobicard_scan_card_url = scanCardUrl;
        window.mobicard_transaction_access_token = transactionAccessToken;
        window.mobicard_token_id = tokenId;
        debugLog('API credentials updated');
    },
    
    // Get current retry count
    getRetryCount: function() {
        return retryCount;
    },
    
    // Reset scanner state
    reset: function() {
        debugLog('Resetting scanner state...');
        retryCount = 0;
        initial_capture_and_submit_flag = 0;
        autoSubmitActive = true;
        stable_counter = 0;
        auto_locked = false;
        scan_paused = false;
        
        // Clear timeouts
        cleanupAllTimers();
        
        // Restart camera
        if (cameraStream) {
            stopCamera();
        }
        setTimeout(initCamera, 500);
        
        debugLog('Scanner reset complete');
    }
};

// Make available globally
window.MobicardScanner = MobicardScanner;

// Auto-initialize if config is available
document.addEventListener('DOMContentLoaded', function() {
    if (window.mobicard_scan_card_url && 
        window.mobicard_transaction_access_token && 
        window.mobicard_token_id) {
        
        debugLog('Auto-initializing Mobicard Scanner...');
        MobicardScanner.init();
    }
});

// ================= CARD PROCESSING UTILITIES =================
// These utilities can be used to process the API response

function detectCardType(number) {
    if (!number) return 'unknown';
    
    const clean = number.toString().replace(/\D/g, '');
    
    if (/^3[47]/.test(clean)) return 'amex';
    if (/^4/.test(clean)) return 'visa';
    if (/^5[1-5]/.test(clean)) return 'mastercard';
    if (/^6/.test(clean)) return 'discover';
    return 'unknown';
}

function formatCardNumber(number) {
    if (!number) return '';
    
    const clean = number.toString().replace(/\D/g, '');
    const type = detectCardType(clean);

    if (type === 'amex') {
        // AMEX format: 4-6-5
        const p1 = clean.substring(0, 4);
        const p2 = clean.substring(4, 10);
        const p3 = clean.substring(10, 15);
        return [p1, p2, p3].filter(Boolean).join('  ');
    } else {
        // Other cards: 4-4-4-4
        return clean.replace(/(.{4})/g, '$1  ').trim();
    }
}

function validateExpiry(expiry) {
    if (!expiry) return false;
    
    const [m, y] = expiry.split('/').map(num => parseInt(num, 10));
    if (!m || !y || m < 1 || m > 12) return false;
    
    const now = new Date();
    const currentYear = parseInt(now.getFullYear().toString().slice(-2), 10);
    const currentMonth = now.getMonth() + 1;
    
    return !(y < currentYear || (y === currentYear && m < currentMonth));
}

function validateCVV(cvv, cardType) {
    if (!cvv) return false;
    
    const clean = cvv.toString().replace(/\D/g, '');
    const isAmex = cardType === 'amex';
    
    if (isAmex) {
        return clean.length === 4;
    } else {
        return clean.length === 3;
    }
}

// Export utilities
window.MobicardUtils = {
    detectCardType,
    formatCardNumber,
    validateExpiry,
    validateCVV
};

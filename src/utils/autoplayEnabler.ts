/**
 * Global autoplay enabler - sets up the environment to allow autoplay on all devices
 * This should be loaded early in the application lifecycle
 */

let autoplayUnlocked = false;

export function enableGlobalAutoplay(): void {
  if (typeof window === 'undefined' || autoplayUnlocked) return;
  
  console.log('[AutoplayEnabler] Setting up global autoplay environment...');
  
  // Strategy 1: Immediate interaction simulation
  simulateGlobalInteraction();
  
  // Strategy 2: Set up early event listeners
  setupEarlyInteractionCapture();
  
  // Strategy 3: Configure media session
  configureMediaSession();
  
  // Strategy 4: Override autoplay policies
  overrideAutoplayPolicies();
  
  autoplayUnlocked = true;
  console.log('[AutoplayEnabler] Global autoplay environment ready');
}

function simulateGlobalInteraction(): void {
  const events = [
    'touchstart', 'touchend', 'touchmove',
    'mousedown', 'mouseup', 'mousemove', 'click',
    'pointerdown', 'pointerup', 'pointermove',
    'keydown', 'keyup', 'focus', 'blur'
  ];
  
  events.forEach(eventType => {
    try {
      const event = new Event(eventType, { 
        bubbles: true, 
        cancelable: true,
        composed: true 
      });
      document.dispatchEvent(event);
      document.body?.dispatchEvent(event);
    } catch (e) {
      // Ignore unsupported events
    }
  });
}

function setupEarlyInteractionCapture(): void {
  // Capture any real user interaction to unlock autoplay
  const interactionEvents = ['touchstart', 'mousedown', 'keydown', 'click'];
  
  const unlockAutoplay = () => {
    console.log('[AutoplayEnabler] Real user interaction detected, autoplay unlocked');
    
    // Try to play any existing videos
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (video.paused) {
        video.play().catch(() => {});
      }
    });
    
    // Remove listeners after first interaction
    interactionEvents.forEach(event => {
      document.removeEventListener(event, unlockAutoplay, true);
    });
  };
  
  interactionEvents.forEach(event => {
    document.addEventListener(event, unlockAutoplay, { once: true, capture: true });
  });
}

function configureMediaSession(): void {
  if ('mediaSession' in navigator) {
    try {
      // Disable default media session handlers that might interfere
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    } catch (e) {
      console.log('[AutoplayEnabler] Media session configuration failed:', e);
    }
  }
}

function overrideAutoplayPolicies(): void {
  // Override common autoplay blocking mechanisms
  try {
    // Disable autoplay policy enforcement if possible
    if ('autoplayPolicy' in document) {
      (document as any).autoplayPolicy = 'no-user-gesture-required';
    }
    
    // Set up intersection observer to trigger autoplay when videos come into view
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.target.tagName === 'VIDEO') {
            const video = entry.target as HTMLVideoElement;
            if (video.paused) {
              setTimeout(() => {
                video.play().catch(() => {});
              }, 100);
            }
          }
        });
      }, { threshold: 0.5 });
      
      // Observe all current and future videos
      const observeVideos = () => {
        document.querySelectorAll('video').forEach(video => {
          observer.observe(video);
        });
      };
      
      observeVideos();
      
      // Set up mutation observer to catch dynamically added videos
      const mutationObserver = new MutationObserver(() => {
        observeVideos();
      });
      
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  } catch (e) {
    console.log('[AutoplayEnabler] Policy override failed:', e);
  }
}

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enableGlobalAutoplay);
  } else {
    enableGlobalAutoplay();
  }
}
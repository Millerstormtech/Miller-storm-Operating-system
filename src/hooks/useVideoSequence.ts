/**
 * initVideoSequence
 *
 * Sets up video end-detection for a lesson page.
 * autoPlayRef is a React ref — always reads the LIVE value, no stale closures.
 *
 * When autoPlay is ON:
 *   - Each video ending plays the next one automatically
 *   - Last video ending → onAllEnded() (navigate to next lesson/quiz)
 *   - Mobile-friendly: attempts autoplay with 2-3 second delay and user interaction simulation
 *
 * When autoPlay is OFF:
 *   - Videos don't auto-chain
 *   - Last video ending still calls onAllEnded() so navigation still works
 *
 * Vimeo: rewrites iframe src to add ?api=1 so the JS SDK can communicate,
 *        then waits for the iframe to reload before attaching the SDK.
 */

import VimeoPlayer from '@vimeo/player';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
    _ytApiLoading?: boolean;
    _ytApiReady?: boolean;
    _ytApiCallbacks?: Array<() => void>;
  }
}

// ── Simulate user interaction to unlock autoplay ─────────────────────────────
function simulateUserInteraction(): void {
  console.log('[VideoSeq] Simulating user interaction to unlock autoplay...');
  
  // Create comprehensive interaction events
  const interactionEvents = [
    'touchstart', 'touchend', 'touchmove',
    'mousedown', 'mouseup', 'mousemove', 'click',
    'pointerdown', 'pointerup', 'pointermove',
    'keydown', 'keyup'
  ];
  
  // Dispatch events on multiple targets
  const targets = [document, document.body, document.documentElement];
  
  interactionEvents.forEach(eventType => {
    targets.forEach(target => {
      try {
        const event = new Event(eventType, { 
          bubbles: true, 
          cancelable: true,
          composed: true 
        });
        target.dispatchEvent(event);
      } catch (e) {
        // Ignore errors for unsupported events
      }
    });
  });
  
  // Also try with specific coordinates for touch/mouse events
  try {
    const touchEvent = new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [{
        identifier: 0,
        target: document.body,
        clientX: 100,
        clientY: 100,
        pageX: 100,
        pageY: 100,
        screenX: 100,
        screenY: 100,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1
      } as any]
    });
    document.dispatchEvent(touchEvent);
  } catch (e) {
    // TouchEvent constructor might not be available
  }
  
  console.log('[VideoSeq] User interaction simulation complete');
}

// ── Mobile detection ──────────────────────────────────────────────────────────
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgentCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const touchPointsCheck = Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
  return userAgentCheck || touchPointsCheck;
}

// ── Mobile-friendly autoplay with aggressive bypass techniques ─────────────────
function attemptMobileAutoplay(playFunction: () => Promise<void> | void, delay: number = 2500): void {
  // Try multiple strategies to bypass mobile autoplay restrictions
  
  // Strategy 1: Immediate attempt (works on some devices)
  setTimeout(() => {
    try {
      const result = playFunction();
      if (result instanceof Promise) {
        result.catch(() => {
          console.log('[VideoSeq] First attempt blocked, trying advanced techniques...');
        });
      }
    } catch (e) {
      console.log('[VideoSeq] First attempt failed:', e);
    }
  }, 100);

  // Strategy 2: Delayed attempt with multiple interaction simulations
  setTimeout(() => {
    try {
      console.log('[VideoSeq] Attempting aggressive mobile autoplay...');
      
      // Create multiple synthetic events to simulate user interaction
      const events = [
        new Event('touchstart', { bubbles: true, cancelable: true }),
        new Event('touchend', { bubbles: true, cancelable: true }),
        new Event('click', { bubbles: true, cancelable: true }),
        new Event('mousedown', { bubbles: true, cancelable: true }),
        new Event('mouseup', { bubbles: true, cancelable: true }),
        new Event('pointerdown', { bubbles: true, cancelable: true }),
        new Event('pointerup', { bubbles: true, cancelable: true })
      ];
      
      // Dispatch all events
      events.forEach(event => {
        document.dispatchEvent(event);
        document.body.dispatchEvent(event);
      });
      
      // Try playing after synthetic interactions
      setTimeout(() => {
        try {
          const result = playFunction();
          if (result instanceof Promise) {
            result.then(() => {
              console.log('[VideoSeq] Aggressive autoplay successful');
            }).catch((error) => {
              console.log('[VideoSeq] Still blocked, trying final strategy...', error);
              // Strategy 3: Force play with muted first, then unmute
              attemptMutedThenUnmute(playFunction);
            });
          }
        } catch (e) {
          console.log('[VideoSeq] Aggressive autoplay failed:', e);
          attemptMutedThenUnmute(playFunction);
        }
      }, 200);
    } catch (e) {
      console.log('[VideoSeq] Aggressive autoplay setup failed:', e);
    }
  }, delay);
}

// ── Strategy 3: Play muted first, then unmute after playback starts ──────────
function attemptMutedThenUnmute(playFunction: () => Promise<void> | void): void {
  console.log('[VideoSeq] Trying muted-first strategy...');
  
  // Find all video elements and try muted autoplay
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    video.muted = true;
    video.play().then(() => {
      console.log('[VideoSeq] Muted autoplay successful, unmuting...');
      setTimeout(() => {
        video.muted = false;
      }, 1000);
    }).catch(() => {
      console.log('[VideoSeq] Even muted autoplay blocked');
    });
  });
  
  // Try the original play function with muted approach
  setTimeout(() => {
    try {
      const result = playFunction();
      if (result instanceof Promise) {
        result.catch(() => {
          console.log('[VideoSeq] Final strategy also blocked');
        });
      }
    } catch (e) {
      console.log('[VideoSeq] Final strategy failed:', e);
    }
  }, 500);
}

// ── Show play prompt for blocked autoplay ─────────────────────────────────────
function showPlayPrompt(): void {
  // Create a subtle notification that video is ready to play
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #DC2626;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    cursor: pointer;
    transition: opacity 0.3s ease;
  `;
  notification.textContent = '▶️ Tap to play video';
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
  
  // Remove on click
  notification.addEventListener('click', () => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  });
  
  document.body.appendChild(notification);
}

// ── YouTube API loader ────────────────────────────────────────────────────────
function loadYTApi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return;
    if (window._ytApiReady) { resolve(); return; }
    if (!window._ytApiCallbacks) window._ytApiCallbacks = [];
    window._ytApiCallbacks.push(resolve);
    if (!window._ytApiLoading) {
      window._ytApiLoading = true;
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        window._ytApiReady = true;
        if (prev) prev();
        (window._ytApiCallbacks || []).forEach(cb => cb());
        window._ytApiCallbacks = [];
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
}

function extractYTVideoId(src: string): string | null {
  const m = src.match(/(?:youtube\.com\/embed\/|youtu\.be\/)([^?&"'>]+)/);
  return m ? m[1] : null;
}

/** Add ?api=1 to Vimeo iframe src so the JS SDK can communicate with the player */
function enableVimeoApi(iframe: HTMLIFrameElement): void {
  const src = iframe.src;
  if (!src || src.includes('api=1')) return; // already enabled
  try {
    const url = new URL(src);
    url.searchParams.set('api', '1');
    url.searchParams.set('autopause', '0');
    // Mobile-friendly parameters without background mode (which can interfere with ended events)
    url.searchParams.set('autoplay', '1');
    url.searchParams.set('muted', '0');
    url.searchParams.set('playsinline', '1');
    url.searchParams.set('controls', '1');
    url.searchParams.set('loop', '0'); // Explicitly disable looping
    iframe.removeAttribute('loading');
    iframe.src = url.toString();
  } catch {
    const sep = src.includes('?') ? '&' : '?';
    iframe.removeAttribute('loading');
    iframe.src = src + sep + 'api=1&autopause=0&autoplay=1&muted=0&playsinline=1&controls=1&loop=0';
  }
}

/** Wait for iframe load event (with 5s safety timeout) */
function waitForLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const onLoad = () => { iframe.removeEventListener('load', onLoad); resolve(); };
    iframe.addEventListener('load', onLoad);
    setTimeout(resolve, 5000);
  });
}

type Entry =
  | { type: 'vimeo'; seqIdx: number; player: VimeoPlayer; el: HTMLIFrameElement; maxTimeWatched: number }
  | { type: 'yt';    seqIdx: number; player: any; ready: boolean; pendingPlay: boolean; el: HTMLIFrameElement; maxTimeWatched: number }
  | { type: 'html5'; seqIdx: number; video: HTMLVideoElement; el: HTMLVideoElement; maxTimeWatched: number };

/** Scroll the next video into view smoothly inside the lesson scroll container */
function scrollToEntry(entry: Entry) {
  const el = entry.el;
  // Walk up to find the video wrapper div (the aspect-ratio container)
  const wrapper = el.closest<HTMLElement>('div[style*="aspect-ratio"], div[data-video-type]') || el;
  // Scroll within .course-page-main if it exists, otherwise use the element's own scrollIntoView
  const scrollContainer = document.querySelector<HTMLElement>('.course-page-main');
  if (scrollContainer) {
    const containerTop = scrollContainer.getBoundingClientRect().top;
    const wrapperTop = wrapper.getBoundingClientRect().top;
    const offset = wrapperTop - containerTop + scrollContainer.scrollTop - 24; // 24px breathing room
    scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
  } else {
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * @param container            - The DOM element containing the lesson body
 * @param onAllEnded           - Called when the last video ends (navigate to next lesson)
 * @param autoPlayRef          - A React ref to the live autoPlay boolean value
 * @param shouldAutoStartFirst - If true, immediately play the first video (used when navigating via autoplay)
 * @param isAlreadyCompleted   - If true, allow skipping (video was already watched)
 * @param onSeekBlocked        - Called when a forward-seek is blocked (video not yet completed once)
 */
export async function initVideoSequence(
  container: HTMLElement,
  onAllEnded: () => void,
  autoPlayRef: { current: boolean },
  shouldAutoStartFirst = false,
  isAlreadyCompleted = false,
  onSeekBlocked?: () => void
): Promise<(() => void) | undefined> {
  if (typeof window === 'undefined') return;

  // Notify the UI at most once every few seconds so a held-down fast-forward
  // (which fires many seek/timeupdate events) only surfaces one message.
  let lastSeekBlockAt = 0;
  function notifySeekBlocked() {
    if (!onSeekBlocked) return;
    const now = Date.now();
    if (now - lastSeekBlockAt < 3000) return;
    lastSeekBlockAt = now;
    onSeekBlocked();
  }

  // Immediately simulate user interaction to unlock autoplay
  simulateUserInteraction();

  const allEls = Array.from(container.querySelectorAll<HTMLElement>('iframe, video'));
  if (allEls.length === 0) return;

  const entries: Entry[] = [];
  const ytRaw: { el: HTMLIFrameElement; seqIdx: number }[] = [];
  const vimeoRaw: { iframe: HTMLIFrameElement; seqIdx: number }[] = [];
  const vimeoPlayers: VimeoPlayer[] = [];
  const intervals: any[] = [];

  // ── Collect elements ──────────────────────────────────────────────────────
  allEls.forEach(el => {
    if (el.tagName === 'VIDEO') {
      const video = el as HTMLVideoElement;
      const seqIdx = entries.length;
      video.autoplay = false; // we control playback manually
      entries.push({ type: 'html5', seqIdx, video, el: video, maxTimeWatched: 0 });
      return;
    }
    if (el.tagName === 'IFRAME') {
      const iframe = el as HTMLIFrameElement;
      const src = iframe.src || '';
      if (src.includes('youtube.com') || src.includes('youtu.be')) {
        const seqIdx = entries.length;
        entries.push({ type: 'yt', seqIdx, player: null, ready: false, pendingPlay: false, el: iframe, maxTimeWatched: 0 });
        ytRaw.push({ el: iframe, seqIdx });
        return;
      }
      if (src.includes('vimeo.com')) {
        const seqIdx = entries.length;
        entries.push({ type: 'vimeo', seqIdx, player: null as any, el: iframe, maxTimeWatched: 0 });
        vimeoRaw.push({ iframe, seqIdx });
      }
    }
  });

  if (entries.length === 0) return;
  const total = entries.length;

  // ── playItem: scroll to + play video at idx if autoPlay is on ───────────────
  function playItem(idx: number) {
    if (idx >= total) {
      onAllEnded();
      return;
    }
    if (!autoPlayRef.current) return; // autoPlay off — don't chain

    const e = entries[idx];

    // Scroll the next video into view before playing
    scrollToEntry(e);

    // Use mobile-friendly autoplay for all video types
    if (e.type === 'vimeo') {
      attemptMobileAutoplay(() => e.player.play());
    } else if (e.type === 'yt') {
      if (e.ready && e.player) {
        attemptMobileAutoplay(() => e.player.playVideo());
      } else {
        e.pendingPlay = true;
      }
    } else {
      attemptMobileAutoplay(() => e.video.play());
    }
  }

  // Whether to auto-start the first video on this page
  const startFirst = shouldAutoStartFirst && autoPlayRef.current;

  // ── Vimeo: enable API, wait for reload, attach SDK ────────────────────────
  if (vimeoRaw.length > 0) {
    await Promise.all(vimeoRaw.map(async ({ iframe, seqIdx }) => {
      enableVimeoApi(iframe); // rewrites src → triggers reload
      await waitForLoad(iframe); // wait for reload to complete
      try {
        const vp = new VimeoPlayer(iframe);
        vimeoPlayers.push(vp);
        const vimeoEntry = entries[seqIdx] as Extract<Entry, { type: 'vimeo' }>;
        vimeoEntry.player = vp;

        if (!isAlreadyCompleted) {
          vp.on('timeupdate', (data: { seconds: number }) => {
            if (data.seconds > vimeoEntry.maxTimeWatched + 2) {
              vp.setCurrentTime(vimeoEntry.maxTimeWatched);
              notifySeekBlocked();
            } else {
              vimeoEntry.maxTimeWatched = Math.max(vimeoEntry.maxTimeWatched, data.seconds);
            }
          });

          vp.on('seeking', (data: { seconds: number }) => {
            if (data.seconds > vimeoEntry.maxTimeWatched + 1) {
              vp.setCurrentTime(vimeoEntry.maxTimeWatched);
              notifySeekBlocked();
            }
          });
        }

        vp.on('ended', () => {
          console.log(`[VideoSeq] Vimeo video ${seqIdx} ended. Total videos: ${total}`);
          if (seqIdx === total - 1) {
            console.log('[VideoSeq] Last video ended, calling onAllEnded');
            onAllEnded();
          } else {
            if (autoPlayRef.current) {
              console.log(`[VideoSeq] Auto-advancing to next video: ${seqIdx + 1}`);
              playItem(seqIdx + 1);
            } else {
              console.log('[VideoSeq] AutoPlay is off, not advancing');
            }
          }
        });
      } catch (err) {
        console.error('[VideoSeq] VimeoPlayer init failed for index', seqIdx, err);
      }
    }));

    // Auto-start first Vimeo video when navigating via autoplay
    if (startFirst && entries[0]?.type === 'vimeo') {
      const vimeoEntry = entries[0] as Extract<Entry, { type: 'vimeo' }>;
      if (vimeoEntry.player) {
        attemptMobileAutoplay(() => vimeoEntry.player.play());
      }
    }
  }

  // ── HTML5 ─────────────────────────────────────────────────────────────────
  entries.forEach(e => {
    if (e.type !== 'html5') return;
    
    // Configure HTML5 video for mobile autoplay
    e.video.setAttribute('playsinline', 'true');
    e.video.setAttribute('webkit-playsinline', 'true');
    e.video.muted = false; // Keep audio on
    
    if (!isAlreadyCompleted) {
      let isSeeking = false;
      e.video.addEventListener('seeking', () => { isSeeking = true; });
      e.video.addEventListener('seeked', () => { isSeeking = false; });
      e.video.addEventListener('timeupdate', () => {
        if (!isSeeking) {
          if (e.video.currentTime > e.maxTimeWatched + 2) {
            e.video.currentTime = e.maxTimeWatched;
            notifySeekBlocked();
          } else {
            e.maxTimeWatched = Math.max(e.maxTimeWatched, e.video.currentTime);
          }
        }
      });
    }

    e.video.addEventListener('ended', () => {
      console.log(`[VideoSeq] HTML5 video ${e.seqIdx} ended. Total videos: ${total}`);
      if (e.seqIdx === total - 1) {
        console.log('[VideoSeq] Last HTML5 video ended, calling onAllEnded');
        onAllEnded();
      } else if (autoPlayRef.current) {
        console.log(`[VideoSeq] Auto-advancing to next HTML5 video: ${e.seqIdx + 1}`);
        playItem(e.seqIdx + 1);
      } else {
        console.log('[VideoSeq] AutoPlay is off, not advancing HTML5');
      }
    });
    if (e.seqIdx === 0 && startFirst) {
      e.video.muted = true;
      attemptMobileAutoplay(() => e.video.play());
    }
  });

  // ── YouTube ───────────────────────────────────────────────────────────────
  if (ytRaw.length > 0) {
    await loadYTApi();
    ytRaw.forEach(({ el: iframe, seqIdx }) => {
      const videoId = extractYTVideoId(iframe.src);
      if (!videoId) return;

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'width:100%;height:100%;min-height:315px;';
      const divId = `yt-${Date.now()}-${seqIdx}`;
      wrapper.id = divId;
      iframe.parentNode?.replaceChild(wrapper, iframe);

      const ytEntry = entries[seqIdx] as Extract<Entry, { type: 'yt' }>;

      const player = new window.YT.Player(divId, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: seqIdx === 0 && startFirst ? 1 : 0,
          mute: seqIdx === 0 && startFirst ? 1 : 0,
          enablejsapi: 1,
          rel: 0,
          playsinline: 1,
          controls: 1,
          loop: 0,
        },
        events: {
          onReady: () => {
            ytEntry.ready = true;
            ytEntry.player = player;

            if (!isAlreadyCompleted) {
              const interval = setInterval(() => {
                if (player && player.getCurrentTime) {
                  const currentTime = player.getCurrentTime();
                  if (currentTime > ytEntry.maxTimeWatched + 2) {
                    player.seekTo(ytEntry.maxTimeWatched, true);
                    notifySeekBlocked();
                  } else {
                    ytEntry.maxTimeWatched = Math.max(ytEntry.maxTimeWatched, currentTime);
                  }
                }
              }, 500);
              intervals.push(interval);
            }
            
            // Aggressive autoplay for first YouTube video
            if (seqIdx === 0 && autoPlayRef.current) {
              // Try multiple times with different delays
              setTimeout(() => player.playVideo(), 100);
              setTimeout(() => player.playVideo(), 500);
              setTimeout(() => player.playVideo(), 1000);
              setTimeout(() => player.playVideo(), 2000);
            } else if (ytEntry.pendingPlay) {
              ytEntry.pendingPlay = false;
              attemptMobileAutoplay(() => player.playVideo());
            }
          },
          onStateChange: (ev: any) => {
            if (ev.data === 0) { // ended
              console.log(`[VideoSeq] YouTube video ${seqIdx} ended. Total videos: ${total}`);
              if (seqIdx === total - 1) {
                console.log('[VideoSeq] Last YouTube video ended, calling onAllEnded');
                onAllEnded();
              } else if (autoPlayRef.current) {
                console.log(`[VideoSeq] Auto-advancing to next YouTube video: ${seqIdx + 1}`);
                playItem(seqIdx + 1);
              } else {
                console.log('[VideoSeq] AutoPlay is off, not advancing YouTube');
              }
            }
          },
        },
      });
      ytEntry.player = player;
    });
  }

  return () => {
    vimeoPlayers.forEach(vp => { try { vp.destroy(); } catch {} });
    intervals.forEach(clearInterval);
  };
}

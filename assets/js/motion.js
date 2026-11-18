/* Motion (GSAP + ScrollTrigger).
   - [data-enter]   comes in once when the page loads
   - [data-reveal]  rises in when scrolled into view
   - [data-count]   counts up to the number already written in the HTML
   - .dive          home only: scrolling fades the intro and takes the water deeper

   Everything sits inside one matchMedia branch, so visitors who prefer reduced
   motion get the finished page with nothing moving. Without this file, or
   without GSAP, the page is still complete: see the note in theme.js. */
(function () {
  'use strict';

  var root = document.documentElement;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;

  if (!gsap || !ScrollTrigger) {
    root.classList.remove('js');
    return;
  }

  /* theme.js already gave up waiting and showed everything. Animating now
     would hide content the visitor can already see, then bring it back. */
  if (!root.classList.contains('js')) return;

  gsap.registerPlugin(ScrollTrigger);

  function setDepth(value) {
    if (window.Water) window.Water.setDepth(value);
  }

  function format(value, decimals) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  var mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', function () {
    var restore = [];

    /* 1. Load: the header pieces arrive in order. */
    var enters = gsap.utils.toArray('[data-enter]');
    if (enters.length) {
      gsap.timeline({ defaults: { duration: 0.9, ease: 'power3.out' }, delay: 0.1 })
        .fromTo(enters, { opacity: 0, y: 18 }, { opacity: 1, y: 0, stagger: 0.09 });
    }

    /* 2. Home: the dive. One scrubbed timeline for the whole tall section. */
    var dive = document.querySelector('.dive');
    if (dive) {
      var water = { depth: 0 };
      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: dive,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6
        }
      })
        .to('.intro', { autoAlpha: 0, y: -56, duration: 0.42 }, 0)
        .to('.cue-wrap', { autoAlpha: 0, duration: 0.14 }, 0)
        .to(water, {
          depth: 1,
          duration: 1,
          onUpdate: function () {
            setDepth(water.depth);
          }
        }, 0);
    }

    /* 3. Rows, stats and sections rise in sequence as they scroll into view. */
    var reveals = gsap.utils.toArray('[data-reveal]');
    if (reveals.length) {
      gsap.set(reveals, { y: 24 });
      ScrollTrigger.batch(reveals, {
        start: 'top 90%',
        once: true,
        onEnter: function (batch) {
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            stagger: 0.09,
            overwrite: true
          });
        }
      });
    }

    /* 4. Count-ups. The real number stays in the HTML; only the text tweens. */
    gsap.utils.toArray('[data-count]').forEach(function (el) {
      var end = parseFloat(el.getAttribute('data-count'));
      if (isNaN(end)) return;
      var from = parseFloat(el.getAttribute('data-count-from')) || 0;
      var decimals = parseInt(el.getAttribute('data-decimals'), 10) || 0;
      var finalText = el.textContent;
      var state = { value: from };

      restore.push(function () {
        el.textContent = finalText;
      });
      el.textContent = format(from, decimals);

      gsap.to(state, {
        value: end,
        duration: 1.5,
        delay: 0.25,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        onUpdate: function () {
          el.textContent = format(state.value, decimals);
        },
        onComplete: function () {
          el.textContent = finalText;
        }
      });
    });

    /* Web fonts change line heights, and with them the trigger positions. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        ScrollTrigger.refresh();
      });
    }

    /* Runs if the visitor switches reduced motion on while the page is open. */
    return function () {
      restore.forEach(function (fn) {
        fn();
      });
      setDepth(0);
    };
  });

  /* Tells theme.js that motion is in charge of revealing content. */
  window.__motion = true;
})();

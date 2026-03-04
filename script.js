/* ============================================================
   THUNDERCLAP — Main Script
   ============================================================ */

// Forces page to always start from the top on refresh
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

/* ── 1. WebGL Shader Hero ─────────────────────────────────── */
(function initShaderHero() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    const gl = canvas.getContext('webgl2');
    if (!gl) {
        console.warn('WebGL2 not supported.');
        canvas.style.background = '#0f0f0f';
        return;
    }

    const VERT_SRC = `#version 300 es
precision highp float;
in vec4 position;
void main(){ gl_Position = position; }`;

    const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2  resolution;
uniform float time;
uniform vec2  touch;
uniform vec2  move;
uniform int   pointerCount;

#define FC gl_FragCoord.xy
#define T  time
#define R  resolution
#define MN min(R.x, R.y)

float rnd(vec2 p) {
    p = fract(p * vec2(12.9898, 78.233));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

float noise(in vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f*f*(3.-2.*f);
    float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p) {
    float t=.0, a=1.;
    mat2 m = mat2(1.,-.5,.2,1.2);
    for(int i=0; i<5; i++){
        t += a*noise(p); p *= 2.*m; a *= .5;
    }
    return t;
}

float clouds(vec2 p) {
    float d=1., t=.0;
    for(float i=.0; i<3.; i++){
        float a = d * fbm(i*10. + p.x*.2 + .2*(1.+i)*p.y + d + i*i + p);
        t = mix(t, d, a); d = a; p *= 2./(i+1.);
    }
    return t;
}

void main(void) {
    vec2 uv = (FC - .5*R)/MN, st = uv*vec2(2,1);
    vec3 col = vec3(0);
    float bg = clouds(vec2(st.x + T*.3, -st.y));
    uv *= 1. - .3*(sin(T*.2)*.5+.5);
    for(float i=1.; i<12.; i++){
        uv += .1*cos(i*vec2(.1+.01*i, .8) + i*i + T*.4 + .1*uv.x);
        vec2 p = uv;
        float d = length(p);
        /* Warm amber/orange cinematic palette */
        col += .00125/d * (cos(sin(i)*vec3(1.8, 0.6, 0.1)) + 1.);
        float b = noise(i + p + bg*1.731);
        col += .002*b / length(max(p, vec2(b*p.x*.02, p.y)));
        col = mix(col, vec3(bg*.30, bg*.12, bg*.02), d);
    }
    /* Darken overall so text stays readable */
    col *= 0.55;
    O = vec4(col, 1);
}`;

    function mkShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            console.error(gl.getShaderInfoLog(s));
        return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);

    gl.useProgram(prog);
    const posLoc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'resolution');
    const uTime = gl.getUniformLocation(prog, 'time');
    const uTouch = gl.getUniformLocation(prog, 'touch');
    const uMove = gl.getUniformLocation(prog, 'move');
    const uPtrCnt = gl.getUniformLocation(prog, 'pointerCount');

    function resize() {
        // Cap at 0.75x DPR — enough quality, much less GPU load
        const dpr = Math.min(0.75, 0.75 * window.devicePixelRatio);
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    let mouse = [0, 0], moveD = [0, 0], ptrCnt = 0;
    let heroVisible = true;   // pause rendering when hero is off-screen
    let lastFrameTime = 0;
    const TARGET_FPS = 30;    // render at 30 fps instead of 60 — half the GPU work
    const FRAME_MS = 1000 / TARGET_FPS;

    // Stop drawing when hero is scrolled out of view
    const observer = new IntersectionObserver(
        (entries) => { heroVisible = entries[0].isIntersecting; },
        { threshold: 0 }
    );
    observer.observe(canvas);

    canvas.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        mouse = [e.clientX - r.left, canvas.offsetHeight - (e.clientY - r.top)];
        moveD = [e.movementX, e.movementY];
        ptrCnt = 1;
    });
    canvas.addEventListener('pointerleave', () => { ptrCnt = 0; });
    canvas.addEventListener('pointerdown', () => { ptrCnt = 1; });
    canvas.addEventListener('pointerup', () => { ptrCnt = 0; });

    function loop(now) {
        requestAnimationFrame(loop);
        // Skip frame if hero is not visible or not enough time has passed
        if (!heroVisible || (now - lastFrameTime) < FRAME_MS) return;
        lastFrameTime = now;

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, now * 1e-3);
        gl.uniform2f(uTouch, mouse[0], mouse[1]);
        gl.uniform2f(uMove, moveD[0], moveD[1]);
        gl.uniform1i(uPtrCnt, ptrCnt);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(loop);
})();

/* ── 2. DOMContentLoaded block ────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    // AOS
    AOS.init({ duration: 1000, once: true, mirror: false });

    // Preloader
    const preloader = document.getElementById('preloader');
    window.addEventListener('load', () => {
        setTimeout(() => {
            preloader.style.opacity = '0';
            setTimeout(() => preloader.style.display = 'none', 1000);
        }, 1500);
    });

    // Navbar scroll
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 100);
    });

    // Before & After Slider
    const slider = document.getElementById('compare-slider');
    const imageBefore = document.querySelector('.image-before');
    if (slider) {
        slider.addEventListener('input', (e) => {
            imageBefore.style.width = `${e.target.value}%`;
        });
    }

    // Instant Quote Estimator
    const eventType = document.getElementById('event-type');
    const duration = document.getElementById('duration');
    const drone = document.getElementById('drone');
    const cinematic = document.getElementById('cinematic');
    const totalPriceDisplay = document.getElementById('total-price');
    const pricing = { wedding: 1000, corporate: 800, birthday: 500, concert: 1200 };

    function calculateTotal() {
        const base = pricing[eventType.value] || 500;
        const hours = parseInt(duration.value) || 0;
        let total = base + (hours * 150);
        if (drone.checked) total += 200;
        if (cinematic.checked) total += 150;
        totalPriceDisplay.textContent = `$${total}`;
        totalPriceDisplay.classList.remove('glow-anim');
        void totalPriceDisplay.offsetWidth;
        totalPriceDisplay.classList.add('glow-anim');
    }
    [eventType, duration, drone, cinematic].forEach(el => {
        el.addEventListener('change', calculateTotal);
        el.addEventListener('input', calculateTotal);
    });
    calculateTotal();

    // "Other" dropdown – Quote estimator
    const quoteOtherInput = document.getElementById('quote-other-input');
    if (eventType && quoteOtherInput) {
        eventType.addEventListener('change', () => {
            quoteOtherInput.classList.toggle('visible', eventType.value === 'other');
            if (eventType.value === 'other') quoteOtherInput.focus();
        });
    }

    // "Other" dropdown – Contact form
    const contactEventType = document.getElementById('contact-event-type');
    const contactOtherInput = document.getElementById('contact-other-input');
    if (contactEventType && contactOtherInput) {
        contactEventType.addEventListener('change', () => {
            contactOtherInput.classList.toggle('visible', contactEventType.value === 'other');
            if (contactEventType.value === 'other') contactOtherInput.focus();
        });
    }

    // Phone Number Restriction (Only Digits)
    const phoneInput = document.querySelector('input[name="phone"]');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }

    // Mobile Menu Toggle
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
        });
    }

    // Smooth Scroll
    document.querySelectorAll('.nav-links a, .nav-cta, .hero-btns a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const id = this.getAttribute('href');
            if (id === '#') return;
            const el = document.querySelector(id);
            if (el) {
                // Close menu if open
                if (hamburger) hamburger.classList.remove('active');
                if (navLinks) navLinks.classList.remove('active');

                window.scrollTo({
                    top: el.offsetTop - (window.innerWidth <= 768 ? 70 : 80),
                    behavior: 'smooth'
                });
            }
        });
    });

    // Contact Form
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = contactForm.querySelector('button');
            const originalText = btn.textContent;

            // Get form data
            const formData = new FormData(contactForm);
            let eventTypeVal = formData.get('event_type');
            const otherDetails = formData.get('other_details');

            // Combine "Other" details if selected
            if (eventTypeVal === 'other' && otherDetails) {
                eventTypeVal = `Other: ${otherDetails}`;
            }

            const templateParams = {
                name: formData.get('name'),
                phone: formData.get('phone'),
                event_type: eventTypeVal,
                message: formData.get('message')
            };

            btn.textContent = 'Sending…';
            btn.disabled = true;

            // Use emailjs.send to include the combined details
            emailjs.send('service_1t7yc0x', 'template_58p49cg', templateParams)
                .then(() => {
                    btn.textContent = 'Message Sent! ⚡';
                    btn.style.background = '#ff8c00';
                    btn.style.boxShadow = '0 0 20px #ff8c00';
                    contactForm.reset();
                    if (contactOtherInput) contactOtherInput.classList.remove('visible');

                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.disabled = false;
                        btn.style.background = '';
                        btn.style.boxShadow = '';
                    }, 4000);
                }, (error) => {
                    console.error('EmailJS Error:', error);
                    btn.textContent = 'Error! Try Again';
                    btn.style.background = '#ff4b2b';

                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.disabled = false;
                        btn.style.background = '';
                    }, 4000);
                });
        });
    }
});

/* ==========================================================================
   VILLA BELLARIA | COUNTRY RELAIS & RETREAT - MOTORE DI PRENOTAZIONE (js/app.js)
   Architettura: Vanilla JS, Moduli Indipendenti, Calcolo Notti, WhatsApp & Orbis Telemetry
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       0. ORBIS PRIVACY-FIRST ANALYTICS ENGINE (Zero Cookie • Zero IP • GDPR-Free)
       ========================================================================== */
    const ORBIS_ANALYTICS = (() => {
        const ENDPOINT = 'https://smith-anchor-untoasted.ngrok-free.dev/api/v1/analytics/hit';
        const SITE_ID = document.body.getAttribute('data-orbis-site') || 'orbis-hotel';
        const DWELL_MS = 2000; // Soglia minima di permanenza visiva (2 secondi)
        const trackedSessionKeys = new Set();

        function sendPulse(eventType, targetId, label = '') {
            if (!SITE_ID || !targetId) return;
            const params = new URLSearchParams({
                site_id: SITE_ID,
                event_type: eventType,
                target_id: targetId
            });
            if (label) params.set('label', label);

            const url = `${ENDPOINT}?${params.toString()}`;
            try {
                fetch(url, {
                    method: 'POST',
                    keepalive: true,
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                }).catch(() => {});
            } catch (_) {
                if (navigator.sendBeacon) navigator.sendBeacon(url);
            }
        }

        function trackPageView(pageName) {
            const cleanPage = (pageName || window.location.pathname.split('/').pop() || 'index.html').trim();
            const dedupKey = `orbis_pv_${SITE_ID}_${cleanPage}`;
            if (sessionStorage.getItem(dedupKey)) return;
            sessionStorage.setItem(dedupKey, '1');
            sendPulse('page_view', cleanPage);
        }

        function observeScrollSections() {
            const sections = document.querySelectorAll('section[id], [data-orbis-section]');
            if (!sections.length || !('IntersectionObserver' in window)) return;

            const activeTimers = new Map();
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const secId = entry.target.getAttribute('data-orbis-section') || entry.target.id;
                    if (!secId) return;

                    if (entry.isIntersecting) {
                        if (trackedSessionKeys.has(`sec_${secId}`) || activeTimers.has(secId)) return;
                        const timerId = setTimeout(() => {
                            trackedSessionKeys.add(`sec_${secId}`);
                            activeTimers.delete(secId);
                            sendPulse('section_view', secId);
                        }, DWELL_MS);
                        activeTimers.set(secId, timerId);
                    } else if (activeTimers.has(secId)) {
                        clearTimeout(activeTimers.get(secId));
                        activeTimers.delete(secId);
                    }
                });
            }, { threshold: 0.35 });

            sections.forEach(sec => observer.observe(sec));
        }

        function bindClickTracking() {
            document.addEventListener('click', (e) => {
                // 1. Viste virtuali / tab multi-pagina simulati
                const virtualPageEl = e.target.closest('[data-orbis-page]');
                if (virtualPageEl) {
                    trackPageView(virtualPageEl.getAttribute('data-orbis-page'));
                }

                // 2. Pulsanti e CTA tracciati
                const trackEl = e.target.closest('[data-orbis-track]');
                if (trackEl) {
                    const trackId = trackEl.getAttribute('data-orbis-track');
                    const trackLabel = trackEl.getAttribute('data-orbis-label') || trackEl.textContent.trim().slice(0, 60);
                    sendPulse('track_click', trackId, trackLabel);
                }
            });
        }

        return {
            init() {
                trackPageView();
                observeScrollSections();
                bindClickTracking();
            },
            trackCustom(trackId, label) {
                sendPulse('track_click', trackId, label);
            }
        };
    })();

    ORBIS_ANALYTICS.init();

    /* ==========================================================================
       1. PRECARICAMENTO IMMAGINI IN RAM (Zero-Lag Experience)
       ========================================================================== */
    const preloadImages = [
        'img/hero-relais.webp',
        'img/suite-giardino.webp',
        'img/suite-deluxe.webp',
        'img/suite-torre.webp',
        'img/colazione-relais.webp',
        'img/degustazione-vini.webp',
        'img/scorcio-tenuta.webp',
        'img/34.webp',
        'img/35.webp'
    ];

    preloadImages.forEach(src => {
        const img = new Image();
        img.src = src;
    });

    /* ==========================================================================
       2. GESTIONE INTERFACCIA (Header & Mobile Menu)
       ========================================================================== */
    const header = document.getElementById('mainHeader');
    const openMenuBtn = document.getElementById('openMobileMenuBtn');
    const closeMenuBtn = document.getElementById('closeMobileMenuBtn');
    const mobileNavDrawer = document.getElementById('mobileNavDrawer');
    const drawerLinks = document.querySelectorAll('.drawer-link');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }, { passive: true });

    function toggleMenu(show) {
        if (show) {
            mobileNavDrawer.classList.add('open');
            mobileNavDrawer.setAttribute('aria-hidden', 'false');
            document.body.classList.add('no-scroll');
        } else {
            mobileNavDrawer.classList.remove('open');
            mobileNavDrawer.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('no-scroll');
        }
    }

    if (openMenuBtn) openMenuBtn.addEventListener('click', () => toggleMenu(true));
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleMenu(false));
    drawerLinks.forEach(link => link.addEventListener('click', () => toggleMenu(false)));

    /* ==========================================================================
       3. DATABASE TARIFFE & PARAMETRI DELLA STRUTTURA
       ========================================================================== */
    const CONFIG = {
        phone: '393409876543',
        touristTaxPerGuestPerNight: 2.50,
        discountPercentage: 15,
        suites: {
            'suite-giardino': { name: 'Junior Suite "Il Giardino"', basePrice: 160, otaPrice: 190 },
            'suite-deluxe': { name: 'Deluxe Suite "La Terrazza"', basePrice: 220, otaPrice: 265 },
            'suite-torre': { name: 'Master Suite "La Torre"', basePrice: 310, otaPrice: 375 },
            'any': { name: 'Miglior Suite Disponibile', basePrice: 160, otaPrice: 190 }
        }
    };

    /* ==========================================================================
       4. MOTORE DATE (Calendario Logico e Vincoli)
       ========================================================================== */
    const checkInInput = document.getElementById('checkInInput');
    const checkOutInput = document.getElementById('checkOutInput');
    const noticeBox = document.getElementById('bookingMinNightsNotice');

    function getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function addDays(dateString, days) {
        const date = new Date(dateString);
        date.setDate(date.getDate() + days);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    if (checkInInput && checkOutInput) {
        const today = getTodayString();
        const tomorrow = addDays(today, 1);

        checkInInput.setAttribute('min', today);
        checkInInput.value = today;

        checkOutInput.setAttribute('min', tomorrow);
        checkOutInput.value = tomorrow;

        checkInInput.addEventListener('change', (e) => {
            const selectedCheckIn = e.target.value;
            const newMinCheckOut = addDays(selectedCheckIn, 1);
            checkOutInput.setAttribute('min', newMinCheckOut);

            if (new Date(checkOutInput.value) <= new Date(selectedCheckIn)) {
                checkOutInput.value = newMinCheckOut;
            }
            validateNightsRule();
        });

        checkOutInput.addEventListener('change', validateNightsRule);
    }

    function validateNightsRule() {
        if (!checkInInput.value || !checkOutInput.value || !noticeBox) return;
        const dIn = new Date(checkInInput.value);
        const dOut = new Date(checkOutInput.value);

        const timeDiff = dOut.getTime() - dIn.getTime();
        const nights = Math.ceil(timeDiff / (1000 * 3600 * 24));
        const dayOfWeek = dIn.getDay();

        if ((dayOfWeek === 5 || dayOfWeek === 6) && nights === 1) {
            noticeBox.classList.remove('hidden');
        } else {
            noticeBox.classList.add('hidden');
        }
    }

    /* ==========================================================================
       5. MODALE PREVENTIVO & PRICING ENGINE
       ========================================================================== */
    const bookingForm = document.getElementById('bookingBarForm');
    const quoteModal = document.getElementById('quoteModal');
    const closeQuoteBtn = document.getElementById('closeQuoteModalBtn');

    const extraWine = document.getElementById('extraWineCheck');
    const extraPicnic = document.getElementById('extraPicnicCheck');
    const extraBike = document.getElementById('extraBikeCheck');
    const allExtras = document.querySelectorAll('.extra-input');

    const uiDates = document.getElementById('modalStayDates');
    const uiNights = document.getElementById('modalStayNights');
    const uiGuests = document.getElementById('modalStayGuests');
    const uiSuiteName = document.getElementById('modalStaySuiteName');

    const uiPriceOta = document.getElementById('modalPriceOta');
    const uiDiscount = document.getElementById('modalDiscountValue');
    const uiCalcDays = document.getElementById('modalCalcDays');
    const uiSubtotal = document.getElementById('modalStaySubtotal');

    const uiExtrasRow = document.getElementById('modalExtrasRow');
    const uiExtrasTotal = document.getElementById('modalExtrasTotal');
    const uiTouristTax = document.getElementById('modalTouristTax');
    const uiFinalPrice = document.getElementById('modalFinalPrice');

    let currentQuote = {
        checkIn: '',
        checkOut: '',
        nights: 1,
        guests: 2,
        suiteId: 'any',
        suiteName: '',
        baseRate: 0,
        otaRate: 0,
        extrasTotal: 0,
        touristTaxTotal: 0,
        finalTotal: 0
    };

    function toggleQuoteModal(show) {
        if (show) {
            quoteModal.classList.add('open');
            quoteModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('no-scroll');
        } else {
            quoteModal.classList.remove('open');
            quoteModal.setAttribute('aria-hidden', 'true');
            if (!mobileNavDrawer.classList.contains('open') && !suiteDrawer.classList.contains('open')) {
                document.body.classList.remove('no-scroll');
            }
        }
    }

    if (closeQuoteBtn) closeQuoteBtn.addEventListener('click', () => toggleQuoteModal(false));

    function formatDateITA(dateString) {
        if (!dateString) return '';
        const parts = dateString.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    function formatEUR(amount) {
        return `€ ${amount.toFixed(2).replace('.', ',')}`;
    }

    function calculateAndRenderQuote() {
        let extrasSum = 0;

        if (extraWine && extraWine.checked) {
            extrasSum += parseFloat(extraWine.getAttribute('data-price-per-guest')) * currentQuote.guests;
        }
        if (extraPicnic && extraPicnic.checked) {
            extrasSum += parseFloat(extraPicnic.getAttribute('data-flat-price'));
        }
        if (extraBike && extraBike.checked) {
            extrasSum += parseFloat(extraBike.getAttribute('data-price-per-day')) * currentQuote.nights;
        }

        currentQuote.extrasTotal = extrasSum;

        const totalOta = currentQuote.otaRate * currentQuote.nights;
        const totalBase = currentQuote.baseRate * currentQuote.nights;
        const discountAmount = totalOta - totalBase;

        currentQuote.touristTaxTotal = currentQuote.guests * currentQuote.nights * CONFIG.touristTaxPerGuestPerNight;
        currentQuote.finalTotal = totalBase + currentQuote.extrasTotal + currentQuote.touristTaxTotal;

        uiDates.textContent = `${formatDateITA(currentQuote.checkIn)} → ${formatDateITA(currentQuote.checkOut)}`;
        uiNights.textContent = `${currentQuote.nights} Nott${currentQuote.nights > 1 ? 'i' : 'e'}`;
        uiGuests.textContent = `${currentQuote.guests} Ospit${currentQuote.guests > 1 ? 'i' : 'e'}`;
        uiSuiteName.textContent = currentQuote.suiteName;

        uiPriceOta.textContent = formatEUR(totalOta);
        uiDiscount.textContent = `- ${formatEUR(discountAmount)}`;
        uiCalcDays.textContent = currentQuote.nights;
        uiSubtotal.textContent = formatEUR(totalBase);
        uiTouristTax.textContent = formatEUR(currentQuote.touristTaxTotal);

        if (currentQuote.extrasTotal > 0) {
            uiExtrasRow.style.display = 'flex';
            uiExtrasTotal.textContent = `+ ${formatEUR(currentQuote.extrasTotal)}`;
        } else {
            uiExtrasRow.style.display = 'none';
        }

        uiFinalPrice.textContent = formatEUR(currentQuote.finalTotal);
        updateWhatsAppLink();
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const checkIn = checkInInput.value;
            const checkOut = checkOutInput.value;
            if (!checkIn || !checkOut) return;

            const dIn = new Date(checkIn);
            const dOut = new Date(checkOut);
            const nights = Math.max(1, Math.ceil((dOut.getTime() - dIn.getTime()) / (1000 * 3600 * 24)));
            const guests = parseInt(document.getElementById('guestsSelect').value, 10);
            const suiteId = document.getElementById('suiteSelect').value;
            const suiteData = CONFIG.suites[suiteId];

            currentQuote.checkIn = checkIn;
            currentQuote.checkOut = checkOut;
            currentQuote.nights = nights;
            currentQuote.guests = guests;
            currentQuote.suiteId = suiteId;
            currentQuote.suiteName = suiteData.name;
            currentQuote.baseRate = suiteData.basePrice;
            currentQuote.otaRate = suiteData.otaPrice;

            calculateAndRenderQuote();
            toggleQuoteModal(true);
        });
    }

    allExtras.forEach(checkbox => {
        checkbox.addEventListener('change', calculateAndRenderQuote);
    });

    /* ==========================================================================
       6. WHATSAPP DEEP-LINK GENERATOR & FORM EMAIL
       ========================================================================== */
    const waBtn = document.getElementById('whatsappBookingBtn');

    function updateWhatsAppLink() {
        if (!waBtn) return;

        let message = `🌿 *Richiesta Prenotazione VILLA BELLARIA*\n\n`;
        message += `Salve, desidero verificare la disponibilità per:\n`;
        message += `🛏️ Alloggio: *${currentQuote.suiteName}*\n`;
        message += `📅 Check-in: *${formatDateITA(currentQuote.checkIn)}*\n`;
        message += `🛫 Check-out: *${formatDateITA(currentQuote.checkOut)}* (${currentQuote.nights} notti)\n`;
        message += `👥 Ospiti: *${currentQuote.guests}*\n\n`;

        if (currentQuote.extrasTotal > 0) {
            message += `✨ Extra aggiunti al pacchetto:\n`;
            if (extraWine.checked) message += `- Degustazione Vini & Frantoio\n`;
            if (extraPicnic.checked) message += `- Cesto Picnic nei Vigneti\n`;
            if (extraBike.checked) message += `- Noleggio E-Bike Giornaliero\n`;
            message += `\n`;
        }

        message += `💳 Preventivo Totale Diretto: *${formatEUR(currentQuote.finalTotal)}*\n`;
        message += `_(Tassa soggiorno e sconto web inclusi)_\n\n`;
        message += `Resto in attesa di una vostra gentile conferma. Grazie!`;

        const encodedMessage = encodeURIComponent(message);
        waBtn.href = `https://wa.me/${CONFIG.phone}?text=${encodedMessage}`;
    }

    const emailForm = document.getElementById('directInquiryForm');
    const successMsg = document.getElementById('inquirySuccessMsg');

    if (emailForm) {
        emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submitEmailInquiryBtn');

            submitBtn.textContent = 'Invio in corso... ⏳';
            submitBtn.disabled = true;

            setTimeout(() => {
                emailForm.classList.add('hidden');
                successMsg.classList.remove('hidden');
            }, 1500);
        });
    }

    /* ==========================================================================
       7. GESTIONE PULSANTI "PRENOTA QUESTA SUITE" DALLE CARD
       ========================================================================== */
    const directBookBtns = document.querySelectorAll('.btn-select-suite');

    directBookBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const suiteId = e.currentTarget.getAttribute('data-suite');
            const selectElement = document.getElementById('suiteSelect');

            if (selectElement) {
                selectElement.value = suiteId;
            }

            const calcBtn = document.getElementById('calcBookingBtn');
            if (calcBtn) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => calcBtn.click(), 500);
            }
        });
    });

    /* ==========================================================================
       8. CASSETTO OFF-CANVAS DETTAGLI SUITE (Schede Tecniche Architettoniche)
       ========================================================================== */
    const suiteDrawer = document.getElementById('suiteDrawer');
    const suiteDrawerBackdrop = document.getElementById('suiteDrawerBackdrop');
    const closeSuiteDrawerBtn = document.getElementById('closeSuiteDrawerBtn');

    const drawerSpecs = document.getElementById('drawerSuiteSpecs');
    const drawerTitle = document.getElementById('drawerSuiteTitle');
    const drawerBody = document.getElementById('drawerSuiteBody');
    const drawerPrice = document.getElementById('drawerSuitePrice');
    const drawerBookBtn = document.getElementById('drawerBookSuiteBtn');

    const suiteDetailsDB = {
        'suite-giardino': {
            specs: '35 mq • Fino a 2 Ospiti • Piano Terra',
            title: 'Junior Suite "Il Giardino"',
            price: '160.00',
            htmlContent: `
                <h4>Architettura & Design</h4>
                <p>Ospitata nell'antica rimessa padronale, questa suite è un rifugio di quiete caratterizzato da tonalità salvia e corda. Il pavimento originale in cotto toscano incontra arredi minimalisti in legno massello lavorato a mano.</p>
                <h4>Il Patio Privato</h4>
                <p>L'ingresso indipendente avviene tramite porte-finestre che inondano la stanza di luce naturale e conducono direttamente al patio riservato, arredato con sedute in ferro battuto sotto l'ombra degli ulivi centenari.</p>
                <h4>Dotazioni Superiori</h4>
                <ul class="drawer-amenities-full">
                    <li>🛏️ Letto Queen Size Simmons (160x200cm) con topper in memory</li>
                    <li>🚿 Bagno in pietra travertino con ampia doccia a pioggia</li>
                    <li>🧴 Set cortesia biologico certificato ICEA all'olio EVO</li>
                    <li>☕ Corner bar con Nespresso e selezione tè/infusi</li>
                    <li>❄️ Climatizzazione domotica radiante (no split rumorosi)</li>
                    <li>📺 Smart TV 43" a scomparsa</li>
                </ul>
            `
        },
        'suite-deluxe': {
            specs: '45 mq • Fino a 2 Ospiti • Primo Piano',
            title: 'Deluxe Suite "La Terrazza"',
            price: '220.00',
            htmlContent: `
                <h4>Architettura & Design</h4>
                <p>Il cuore nobile del casale. Soffitti vertiginosi con enormi travi di castagno d'epoca e finestre bifore affacciate sulle colline. L'elemento focale è la maestosa vasca da bagno freestanding in resina opaca, posta scenograficamente all'interno della camera.</p>
                <h4>La Terrazza Solarium</h4>
                <p>Un balcone panoramico di 18 metri quadrati a uso esclusivo, esposto a sud-ovest per godere dei leggendari tramonti della Val d'Orcia in totale intimità.</p>
                <h4>Dotazioni Superiori</h4>
                <ul class="drawer-amenities-full">
                    <li>🛏️ Letto King Size a Baldacchino (180x200cm)</li>
                    <li>🛁 Vasca freestanding in camera + cabina doccia separata</li>
                    <li>🍷 Cantinetta frigo privata con selezione di Brunello e Nobile</li>
                    <li>🌬️ Asciugacapelli Dyson Supersonic™</li>
                    <li>🧴 Set accappatoi in spugna di cotone organico 600g</li>
                    <li>🔊 Sound system Bluetooth Marshall Stanmore</li>
                </ul>
            `
        },
        'suite-torre': {
            specs: '60 mq • Fino a 4 Ospiti • Due Livelli (Duplex)',
            title: 'Master Suite "La Torre"',
            price: '310.00',
            htmlContent: `
                <h4>Architettura & Design</h4>
                <p>Il fiore all'occhiello di Villa Bellaria, ricavata nell'antica torre di avvistamento cinquecentesca su due livelli collegati da una scala interna in pietra serena. Al piano inferiore un salotto intimo con camino a legna funzionante; al piano superiore la camera padronale con vista panoramica a 360 gradi sulla Val d'Orcia.</p>
                <h4>Area Benessere Privata</h4>
                <p>Mini-piscina idromassaggio Jacuzzi riservata direttamente in suite, ideale per rilassarsi al tramonto ammirando i cipressi e le colline di Pienza.</p>
                <h4>Dotazioni Superiori</h4>
                <ul class="drawer-amenities-full">
                    <li>🔥 Camino storico a legna funzionante</li>
                    <li>🫧 Vasca idromassaggio Jacuzzi privata in suite</li>
                    <li>🛏️ Letto King Size + divano letto matrimoniale al piano inferiore</li>
                    <li>🎶 Impianto acustico Marshall Bluetooth</li>
                    <li>🍷 Cantinetta vini privati &amp; corner Nespresso</li>
                    <li>🧴 Set cortesia biologico certificato ICEA all'olio EVO</li>
                </ul>
            `
        }
    };

    const openDrawerBtns = document.querySelectorAll('.btn-open-drawer');
    let currentDrawerSuiteId = 'suite-giardino';

    function toggleSuiteDrawer(show) {
        if (!suiteDrawer || !suiteDrawerBackdrop) return;
        if (show) {
            suiteDrawer.classList.add('open');
            suiteDrawerBackdrop.classList.add('open');
            suiteDrawer.setAttribute('aria-hidden', 'false');
            suiteDrawerBackdrop.setAttribute('aria-hidden', 'false');
            document.body.classList.add('no-scroll');
        } else {
            suiteDrawer.classList.remove('open');
            suiteDrawerBackdrop.classList.remove('open');
            suiteDrawer.setAttribute('aria-hidden', 'true');
            suiteDrawerBackdrop.setAttribute('aria-hidden', 'true');
            if (!mobileNavDrawer.classList.contains('open') && !quoteModal.classList.contains('open')) {
                document.body.classList.remove('no-scroll');
            }
        }
    }

    openDrawerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const suiteId = e.currentTarget.getAttribute('data-suite');
            const data = suiteDetailsDB[suiteId];
            if (!data) return;

            currentDrawerSuiteId = suiteId;
            if (drawerSpecs) drawerSpecs.textContent = data.specs;
            if (drawerTitle) drawerTitle.textContent = data.title;
            if (drawerBody) drawerBody.innerHTML = data.htmlContent;
            if (drawerPrice) drawerPrice.textContent = `€ ${data.price}`;

            toggleSuiteDrawer(true);
        });
    });

    if (closeSuiteDrawerBtn) closeSuiteDrawerBtn.addEventListener('click', () => toggleSuiteDrawer(false));
    if (suiteDrawerBackdrop) suiteDrawerBackdrop.addEventListener('click', () => toggleSuiteDrawer(false));

    if (drawerBookBtn) {
        drawerBookBtn.addEventListener('click', () => {
            toggleSuiteDrawer(false);
            const selectElement = document.getElementById('suiteSelect');
            if (selectElement) {
                selectElement.value = currentDrawerSuiteId;
            }
            const calcBtn = document.getElementById('calcBookingBtn');
            if (calcBtn) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => calcBtn.click(), 450);
            }
        });
    }

});

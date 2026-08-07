import { decorateIcons, getMetadata } from '../../../scripts/aem.js';
import {
  LOCALE_REGIONS,
  bindLocalePanel,
  buildLocalePanel,
  getCurrentLocaleCode,
} from '../../../scripts/locales.js';
import {
  STOREFRONT,
  getStorefrontSession,
  fetchMiniCartDetails,
} from '../../../scripts/storefront-session.js';
import { sitePath } from '../../../scripts/drivparts-paths.js';

const isDesktop = window.matchMedia('(min-width: 900px)');

const LINK_ICONS = {
  'sign in': 'user',
  'my account': 'user',
  'contact us': 'envelope',
  'where to buy': 'map-marker',
};

/**
 * QA main-nav role visibility, simplified to logged-in vs guest: Online Tools
 * and Support are gated behind B2B roles, so they only appear once signed in.
 * Every other authored item (Garage Gurus included) stays visible in both states.
 */
const AUTH_REQUIRED_LABELS = new Set(['online tools', 'support']);

/**
 * Normalizes a main-nav item label for auth visibility matching.
 * @param {string} text
 * @returns {string}
 */
function normalizeNavLabel(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Reads the visible label from a main-nav item trigger (ignores caret text).
 * @param {Element} item
 * @returns {string}
 */
function mainNavItemLabel(item) {
  const trigger = item.querySelector(':scope > a');
  if (!trigger) return '';
  return normalizeNavLabel(
    trigger.childNodes[0]?.textContent || trigger.textContent,
  );
}

/**
 * Marks a desktop nav item that requires sign-in. Starts hidden so the
 * signed-out layout paints without a flash of gated items.
 * @param {Element} item
 * @param {string} label
 */
function markAuthNavVisibility(item, label) {
  if (!AUTH_REQUIRED_LABELS.has(normalizeNavLabel(label))) return;
  item.classList.add('nav-auth-required');
  item.hidden = true;
}

/**
 * Copies the auth-required marker from a desktop nav item onto its mobile twin.
 * @param {Element} item
 * @param {Element} mobileEl
 */
function syncAuthNavVisibility(item, mobileEl) {
  if (!item.classList.contains('nav-auth-required')) return;
  mobileEl.classList.add('nav-auth-required');
  mobileEl.hidden = item.hidden;
}

/**
 * Toggles main-nav items to match QA signed-in vs signed-out layouts.
 * Guest: Digital Catalogs | Brands | Garage Gurus | About Us
 * Signed in: adds Online Tools | Support
 * @param {Element} nav
 * @param {{ loggedIn: boolean }} session
 * @param {Element|null} [drawer]
 */
function applyAuthMainNav(nav, session, drawer = null) {
  const hidden = !session.loggedIn;
  nav.querySelectorAll('.nav-menu > .nav-item.nav-auth-required').forEach((item) => {
    item.hidden = hidden;
  });
  drawer?.querySelectorAll('.nav-auth-required').forEach((el) => {
    el.hidden = hidden;
  });
}

/**
 * Builds an auth utility list item with an optional icon.
 * @param {string} className
 * @param {string} href
 * @param {string} label
 * @param {string} [iconName]
 * @returns {HTMLLIElement}
 */
function createAuthLinkItem(className, href, label, iconName) {
  const item = document.createElement('li');
  item.className = className;
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  if (iconName) {
    const icon = document.createElement('span');
    icon.className = `icon icon-${iconName}`;
    icon.setAttribute('aria-hidden', 'true');
    link.prepend(icon);
  }
  item.append(link);
  return item;
}

/**
 * Remembers return URL so logout / end-emulate can bring the user back.
 * @param {HTMLAnchorElement} link
 */
/**
 * End Emulate must not top-level-navigate to Hybris iframe HTML.
 * Hit end-emulate in a hidden frame, then return to the EDS page (/drivparts/).
 * @param {HTMLAnchorElement} link
 */
function bindEndEmulateReturn(link) {
  if (!link || link.dataset.endEmulateBound) return;
  link.dataset.endEmulateBound = 'true';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const returnTo = window.location.href;
    try {
      sessionStorage.setItem('fm-login-return', returnTo);
    } catch (err) {
      // ignore
    }

    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    frame.src = STOREFRONT.endEmulate;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      frame.remove();
      window.location.assign(returnTo);
    };

    frame.addEventListener('load', finish, { once: true });
    document.body.append(frame);
    window.setTimeout(finish, 2500);
  });
}
function bindReturnOnClick(link) {
  // Guest links survive re-renders, so only ever attach once.
  if (link.dataset.returnBound) return;
  link.dataset.returnBound = 'true';
  link.addEventListener('click', () => {
    try {
      sessionStorage.setItem('fm-login-return', window.location.href);
    } catch (e) {
      // ignore
    }
  });
}

/**
 * Formats a USD amount for the mini-cart (QA uses currency:"$").
 * @param {number | null | undefined} value
 * @returns {string}
 */
function formatCartPrice(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

/**
 * Builds / refreshes the QA-style mini-cart popup under Shopping Cart.
 * @param {HTMLLIElement} cartItem
 * @param {{ totalItems: number, totalPrice: number | null, entries: Array<{
 *   name: string, code: string, quantity: number, imageUrl: string, price: number | null
 * }> }} details
 */
function renderMiniCartPopup(cartItem, details) {
  let popup = cartItem.querySelector('.nav-mini-cart-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.className = 'nav-mini-cart-popup';
    popup.hidden = true;
    cartItem.append(popup);
  }

  popup.replaceChildren();

  const title = document.createElement('h3');
  title.className = 'nav-mini-cart-title';
  title.textContent = details.totalItems > 0 ? 'Shopping Cart' : 'Empty Cart';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nav-mini-cart-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    popup.hidden = true;
  });
  title.append(closeBtn);
  popup.append(title);

  const content = document.createElement('div');
  content.className = 'nav-mini-cart-content';

  details.entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'nav-mini-cart-entry';

    const img = document.createElement('img');
    img.className = 'nav-mini-cart-entry-image';
    img.src = entry.imageUrl;
    img.alt = '';
    img.width = 86;
    img.height = 86;
    img.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'nav-mini-cart-entry-info';
    const name = document.createElement('span');
    name.className = 'nav-mini-cart-entry-name';
    name.textContent = entry.name;
    const code = document.createElement('p');
    code.className = 'nav-mini-cart-entry-code';
    code.textContent = `Part No: ${entry.code}`;
    const qty = document.createElement('p');
    qty.className = 'nav-mini-cart-entry-qty';
    qty.textContent = `Quantity: ${entry.quantity}`;
    info.append(name, code, qty);

    const rate = document.createElement('div');
    rate.className = 'nav-mini-cart-entry-rate';
    rate.textContent = formatCartPrice(entry.price);

    row.append(img, info, rate);
    content.append(row);
  });
  popup.append(content);

  const total = document.createElement('div');
  total.className = 'nav-mini-cart-total';
  const totalLabel = document.createElement('p');
  totalLabel.textContent = `Total ${formatCartPrice(details.totalPrice)}`;
  total.append(totalLabel);
  popup.append(total);

  const checkout = document.createElement('a');
  checkout.className = 'nav-mini-cart-checkout';
  checkout.href = STOREFRONT.cart;
  checkout.textContent = 'Checkout';
  popup.append(checkout);
}

/**
 * Hover / focus mini-cart for authenticated Shopping Cart link (QA hybris-cart-popup).
 * @param {HTMLLIElement} cartItem
 */
function bindMiniCart(cartItem) {
  const popup = () => cartItem.querySelector('.nav-mini-cart-popup');
  let hideTimer = 0;
  let loading = false;

  const show = async () => {
    window.clearTimeout(hideTimer);
    let el = popup();
    if (!el) {
      renderMiniCartPopup(cartItem, { totalItems: 0, totalPrice: null, entries: [] });
      el = popup();
    }
    el.hidden = false;
    if (loading) return;
    loading = true;
    try {
      const details = await fetchMiniCartDetails();
      renderMiniCartPopup(cartItem, details);
      const next = popup();
      if (next) next.hidden = false;
    } finally {
      loading = false;
    }
  };

  const hide = () => {
    hideTimer = window.setTimeout(() => {
      const el = popup();
      if (el) el.hidden = true;
    }, 150);
  };

  cartItem.addEventListener('mouseenter', show);
  cartItem.addEventListener('mouseleave', hide);
  cartItem.addEventListener('focusin', show);
  cartItem.addEventListener('focusout', hide);
}

/**
 * Updates utility-bar auth links to match QA after Hybris login:
 * Guest links hidden; Welcome | My Account | Shopping Cart (n) | Sign Out
 * (and End Emulate[acct - name] when emulating).
 * @param {Element} nav
 * @param {{ loggedIn: boolean, displayName: string, mode?: string,
 *   emulateLabel?: string, cartCount?: number }} session
 * @param {Element|null} [drawer]
 */
function applyAuthUtilityLinks(nav, session, drawer = null) {
  const utilityList = nav.querySelector('.nav-utility-links');
  if (!utilityList) return;

  // Always rebuild dynamic auth items so CSR → emulating transitions update
  utilityList.querySelectorAll('.nav-auth-welcome, .nav-auth-account, .nav-auth-cart, .nav-auth-signout, .nav-auth-endemulate')
    .forEach((el) => el.remove());
  drawer?.querySelectorAll('.nav-mobile-auth').forEach((el) => el.remove());

  const guestItems = [...utilityList.querySelectorAll(':scope > li')];

  if (!session.loggedIn) {
    utilityList.classList.remove('is-authenticated');
    // Path-only redirect — Imperva 403s absolute localhost URLs in ?redirect=
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}` || '/';
    const signInHref = `${STOREFRONT.signIn}?redirect=${encodeURIComponent(returnPath)}`;
    const rewriteSignIn = (link) => {
      if (!link) return;
      const label = link.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      const href = link.getAttribute('href') || '';
      if ((label === 'sign in' || /\/sign-in\b/i.test(href)) && !href.includes('/fmstorefront')) {
        link.href = signInHref;
        bindReturnOnClick(link);
      }
    };
    guestItems.forEach((item) => {
      item.hidden = false;
      rewriteSignIn(item.querySelector('a'));
    });
    drawer?.querySelectorAll('.nav-mobile-utility').forEach((el) => {
      el.hidden = false;
      rewriteSignIn(el);
    });
    return;
  }

  // QA: role-based guest links (Careers, OE, …) hide once a CSR is signed in
  utilityList.classList.add('is-authenticated');
  guestItems.forEach((item) => {
    item.hidden = true;
  });
  drawer?.querySelectorAll('.nav-mobile-utility').forEach((el) => {
    el.hidden = true;
  });

  const welcome = document.createElement('li');
  welcome.className = 'nav-auth-welcome';
  welcome.textContent = session.displayName
    ? `Welcome ${session.displayName}`
    : 'Welcome';

  const account = createAuthLinkItem(
    'nav-auth-account',
    STOREFRONT.account,
    'My Account',
    'user',
  );

  const cartCount = Number.isFinite(session.cartCount) ? session.cartCount : 0;
  const cart = createAuthLinkItem(
    'nav-auth-cart',
    STOREFRONT.cart,
    `Shopping Cart (${cartCount})`,
  );
  bindMiniCart(cart);

  const signOut = createAuthLinkItem(
    'nav-auth-signout',
    STOREFRONT.logout,
    'Sign Out',
  );
  bindReturnOnClick(signOut.querySelector('a'));

  utilityList.append(welcome, account, cart, signOut);

  if (session.mode === 'emulating') {
    const endEmulate = createAuthLinkItem(
      'nav-auth-endemulate',
      STOREFRONT.endEmulate,
      session.emulateLabel
        ? `End Emulate[${session.emulateLabel}]`
        : 'End Emulate',
    );
    bindEndEmulateReturn(endEmulate.querySelector('a'));
    utilityList.append(endEmulate);
  }

  decorateIcons(utilityList);

  // Mirror auth links into the mobile drawer (below the search / main items)
  if (drawer) {
    const root = drawer.querySelector('.nav-mobile-root');
    if (root) {
      const mobileAuth = [welcome, account, cart, signOut]
        .concat(session.mode === 'emulating' ? [utilityList.querySelector('.nav-auth-endemulate')] : [])
        .filter(Boolean)
        .map((li) => {
          const link = li.querySelector('a');
          if (link) {
            const a = link.cloneNode(true);
            a.className = 'nav-mobile-link nav-mobile-auth';
            return a;
          }
          const span = document.createElement('span');
          span.className = 'nav-mobile-link nav-mobile-auth nav-mobile-welcome';
          span.textContent = li.textContent;
          return span;
        });
      root.append(...mobileAuth);
      decorateIcons(root);
    }
  }
}

/**
 * Fetches the nav fragment HTML from the metadata path (default `/nav`).
 */
async function fetchNav() {
  const navMeta = getMetadata('nav');
  const defaultNav = sitePath('/nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : defaultNav;
  try {
    const resp = await fetch(`${navPath}.plain.html`);
    if (!resp.ok) return null;
    const html = await resp.text();
    const container = document.createElement('div');
    container.innerHTML = html;
    return container;
  } catch {
    // Network failure (offline/DNS/CORS): same "no nav" outcome as a bad
    // response above, so callers only ever need the one null-check branch.
    return null;
  }
}

/**
 * Prepends a named icon span to a link when a mapping exists.
 * @param {Element} link Anchor element
 */
function prependLinkIcon(link) {
  const key = link.textContent.trim().toLowerCase();
  const iconName = LINK_ICONS[key];
  if (!iconName) return;
  const icon = document.createElement('span');
  icon.className = `icon icon-${iconName}`;
  icon.setAttribute('aria-hidden', 'true');
  link.prepend(icon);
}

/**
 * Closes any open dropdowns in the main nav row.
 * @param {Element} row The main nav row element
 */
function closeAllDropdowns(row) {
  row.querySelectorAll('.nav-item.has-dropdown > a[aria-expanded="true"]').forEach((trigger) => {
    trigger.setAttribute('aria-expanded', 'false');
  });
}

/**
 * Builds the utility bar (row 0): locale selector + utility links.
 * @param {Element} section The source section div
 * @param {Element} localePanel The region panel controlled by the locale button
 */
function buildUtilityBar(section, localePanel) {
  const bar = document.createElement('div');
  bar.className = 'nav-utility';

  const localeText = section.querySelector('p');
  const locale = document.createElement('button');
  locale.type = 'button';
  locale.className = 'nav-locale';
  locale.setAttribute('aria-expanded', 'false');
  locale.setAttribute('aria-controls', localePanel.id);
  locale.setAttribute('aria-haspopup', 'true');
  locale.textContent = localeText ? localeText.textContent.trim() : 'English (United States)';
  const caret = document.createElement('span');
  caret.className = 'nav-caret';
  caret.setAttribute('aria-hidden', 'true');
  locale.append(caret);
  bar.append(locale);

  const links = section.querySelector('ul');
  if (links) {
    links.className = 'nav-utility-links';
    links.querySelectorAll('a').forEach(prependLinkIcon);
    bar.append(links);
  }
  return bar;
}

/**
 * Builds the logo row (row 1): logo + quick links.
 * @param {Element} section The source section div
 */
function buildLogoRow(section) {
  const row = document.createElement('div');
  row.className = 'nav-logo-row';

  const logoLink = section.querySelector('a');
  if (logoLink) {
    logoLink.className = 'nav-logo';
    // Authored nav content marks every image `loading="lazy"` by default,
    // but this logo is always above the fold and is frequently the page's
    // LCP element -- lazy-loading it (deferring the fetch until the browser
    // confirms it's near-viewport) delays that critical paint instead of
    // letting the preload scanner start it immediately.
    //
    // This parsed `<img>` came from `container.innerHTML = html` in
    // fetchNav() -- the browser's parser already read (and may have already
    // acted on) its authored `loading="lazy"` the instant that innerHTML
    // assignment ran, before this function ever gets a chance to flip the
    // attribute. Mutating the existing element after the fact is too late to
    // reliably change the fetch that's already been kicked off. Building a
    // *replacement* element instead -- with `loading` set before `src` is
    // ever assigned -- guarantees the browser only ever sees the corrected
    // attribute for this image's actual fetch. It's inserted in the
    // original's exact position inside the same `<picture>`, so the sibling
    // `<source>` variants still negotiate normally.
    //
    // No `fetchpriority="high"`: aem.live measured that hack as net-negative
    // in this delivery model -- the preload scanner already prioritizes an
    // eager, in-viewport image without it.
    const oldImg = logoLink.querySelector('img');
    if (oldImg) {
      const freshImg = document.createElement('img');
      freshImg.loading = 'eager';
      freshImg.alt = oldImg.alt;
      if (oldImg.hasAttribute('width')) freshImg.width = oldImg.width;
      if (oldImg.hasAttribute('height')) freshImg.height = oldImg.height;
      freshImg.src = oldImg.getAttribute('src');
      oldImg.replaceWith(freshImg);
    }
    row.append(logoLink);
  }

  const links = section.querySelector('ul');
  if (links) {
    links.className = 'nav-quick-links';
    links.querySelectorAll('a').forEach(prependLinkIcon);
    row.append(links);
  }
  return row;
}

/**
 * Marks a top-level nav item active when the current page is that link's
 * target (or a page beneath it, e.g. /drivparts/brands/abex under BRANDS).
 * @param {Element} item The .nav-item <li>
 */
function markActiveNavItem(item) {
  const link = item.querySelector(':scope > a');
  if (!link || !link.href) return;
  const linkPath = new URL(link.href, window.location.href).pathname.replace(/\/$/, '');
  const currentPath = window.location.pathname.replace(/\/$/, '');
  if (linkPath && (currentPath === linkPath || currentPath.startsWith(`${linkPath}/`))) {
    item.classList.add('nav-item-active');
  }
}

/**
 * Builds the main nav row (row 2): nav items with dropdowns + search form.
 * @param {Element} section The source section div
 */
function buildMainNav(section) {
  const row = document.createElement('div');
  row.className = 'nav-main';
  const inner = document.createElement('div');
  inner.className = 'nav-main-inner';
  row.append(inner);

  const list = section.querySelector('ul');
  if (list) {
    list.className = 'nav-menu';
    list.querySelectorAll(':scope > li').forEach((item) => {
      item.classList.add('nav-item');
      item.querySelectorAll(':scope > p').forEach((p) => p.replaceWith(...p.childNodes));
      markAuthNavVisibility(item, mainNavItemLabel(item));
      markActiveNavItem(item);
      const submenu = item.querySelector(':scope > ul');
      if (submenu) {
        item.classList.add('has-dropdown');
        submenu.classList.add('nav-dropdown');
        const trigger = item.querySelector(':scope > a');
        const caret = document.createElement('span');
        caret.className = 'nav-caret';
        if (trigger) {
          trigger.append(caret);
          // aria-expanded belongs on the interactive trigger, not the <li>
          trigger.setAttribute('aria-expanded', 'false');
          trigger.setAttribute('aria-haspopup', 'true');
        }
        const openDropdown = () => trigger?.setAttribute('aria-expanded', 'true');
        const closeDropdown = () => trigger?.setAttribute('aria-expanded', 'false');
        item.addEventListener('mouseenter', () => {
          if (isDesktop.matches) openDropdown();
        });
        item.addEventListener('mouseleave', () => {
          if (isDesktop.matches) closeDropdown();
        });
        // Keyboard/screen-reader users don't trigger mouseenter -- without
        // this the dropdown (shown via CSS :has(aria-expanded='true')) is
        // never revealed and its links are unreachable by Tab.
        item.addEventListener('focusin', () => {
          if (isDesktop.matches) openDropdown();
        });
        item.addEventListener('focusout', (e) => {
          if (isDesktop.matches && !item.contains(e.relatedTarget)) closeDropdown();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && isDesktop.matches) {
            closeDropdown();
            trigger?.focus();
          }
        });
      }
    });
    inner.append(list);
  }

  const form = document.createElement('form');
  form.className = 'nav-search';
  form.setAttribute('role', 'search');
  // Live submits this to /results.html?part=...&searchType=part-number-search.
  form.action = sitePath('/results');
  const searchType = document.createElement('input');
  searchType.type = 'hidden';
  searchType.name = 'searchType';
  searchType.value = 'part-number-search';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'nav-search-submit';
  submit.setAttribute('aria-label', 'Search');
  const searchIcon = document.createElement('span');
  searchIcon.className = 'icon icon-search';
  searchIcon.setAttribute('aria-hidden', 'true');
  submit.append(searchIcon);
  const input = document.createElement('input');
  input.type = 'search';
  input.name = 'part';
  input.placeholder = 'Search by Part #, Crossref, CPL';
  input.setAttribute('aria-label', 'Search by Part #, Crossref, CPL');
  form.append(searchType, submit, input);
  inner.append(form);

  return row;
}

/**
 * Builds the mobile drawer: root list + drill-down panels (locale / submenus).
 * @param {Object} parts
 * @param {Element|null} parts.utilityBar
 * @param {Element|null} parts.logoRow
 * @param {Element|null} parts.mainRow
 * @param {string} parts.localeLabel
 * @returns {object} drawer helpers
 */
function buildMobileDrawer({
  utilityBar, logoRow, mainRow, localeLabel,
}) {
  const drawer = document.createElement('div');
  drawer.className = 'nav-mobile';
  drawer.hidden = true;

  const root = document.createElement('div');
  root.className = 'nav-mobile-panel nav-mobile-root';
  drawer.append(root);

  const setLevel = (level) => {
    drawer.dataset.level = level;
    drawer.querySelectorAll('.nav-mobile-panel').forEach((panel) => {
      const active = panel.dataset.panel === level;
      panel.classList.toggle('is-active', active);
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    // Keep root (Sign In, etc.) from peeking under drill-downs
    drawer.scrollTop = 0;
  };

  // ---- Locale entry ----
  const localeBtn = document.createElement('button');
  localeBtn.type = 'button';
  localeBtn.className = 'nav-mobile-link nav-mobile-locale';
  localeBtn.innerHTML = `<span>${localeLabel}</span><span class="nav-mobile-chevron" aria-hidden="true"></span>`;
  localeBtn.addEventListener('click', () => setLevel('locale'));
  root.append(localeBtn);

  // ---- Main nav items ----
  if (mainRow) {
    const menu = mainRow.querySelector('.nav-menu');
    if (menu) {
      menu.querySelectorAll(':scope > .nav-item').forEach((item, index) => {
        const trigger = item.querySelector(':scope > a');
        if (!trigger) return;
        const label = trigger.childNodes[0]?.textContent?.trim()
          || trigger.textContent.replace(/\s+/g, ' ').trim();
        const submenu = item.querySelector(':scope > .nav-dropdown');
        const panelId = `submenu-${index}`;

        if (submenu) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'nav-mobile-link';
          btn.innerHTML = `<span>${label}</span><span class="nav-mobile-chevron" aria-hidden="true"></span>`;
          btn.addEventListener('click', () => setLevel(panelId));
          syncAuthNavVisibility(item, btn);
          root.append(btn);

          const panel = document.createElement('div');
          panel.className = 'nav-mobile-panel nav-mobile-submenu';
          panel.dataset.panel = panelId;

          const back = document.createElement('button');
          back.type = 'button';
          back.className = 'nav-mobile-back';
          back.innerHTML = `<span class="nav-mobile-back-arrow" aria-hidden="true"></span><span>${label}</span>`;
          back.addEventListener('click', () => setLevel('root'));
          panel.append(back);

          const list = document.createElement('ul');
          list.className = 'nav-mobile-sublist';

          // Overview = parent nav link (matches drivparts.com)
          if (trigger.href) {
            const overviewLi = document.createElement('li');
            const overview = document.createElement('a');
            overview.href = trigger.href;
            overview.textContent = 'Overview';
            overviewLi.append(overview);
            list.append(overviewLi);
          }

          submenu.querySelectorAll(':scope > li > a').forEach((link) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = link.href;
            a.textContent = link.textContent.replace(/\s+/g, ' ').trim();
            li.append(a);
            list.append(li);
          });
          panel.append(list);
          drawer.append(panel);
        } else {
          const a = document.createElement('a');
          a.className = 'nav-mobile-link';
          a.href = trigger.href;
          a.textContent = label;
          syncAuthNavVisibility(item, a);
          root.append(a);
        }
      });
    }

    const search = mainRow.querySelector('.nav-search');
    if (search) root.append(search.cloneNode(true));
  }

  // ---- Utility links (Careers … Sign In) ----
  utilityBar?.querySelectorAll('.nav-utility-links > li > a').forEach((link) => {
    const a = link.cloneNode(true);
    a.className = 'nav-mobile-link nav-mobile-utility';
    root.append(a);
  });

  // ---- Quick links (#PartsMatter, Where To Buy) — skip Contact Us to match source mobile ----
  logoRow?.querySelectorAll('.nav-quick-links > li > a').forEach((link) => {
    const text = [...link.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('')
      .trim()
      .toLowerCase() || link.textContent.trim().toLowerCase();
    if (text.includes('contact us')) return;
    const a = link.cloneNode(true);
    a.className = 'nav-mobile-link';
    root.append(a);
  });

  // ---- Locale drill-down panel ----
  const localePanel = document.createElement('div');
  localePanel.className = 'nav-mobile-panel nav-mobile-locales';
  localePanel.dataset.panel = 'locale';

  const localeBack = document.createElement('button');
  localeBack.type = 'button';
  localeBack.className = 'nav-mobile-back';
  localeBack.innerHTML = `<span class="nav-mobile-back-arrow" aria-hidden="true"></span><span>${localeLabel}</span>`;
  localeBack.addEventListener('click', () => setLevel('root'));
  localePanel.append(localeBack);

  LOCALE_REGIONS.forEach((region) => {
    const group = document.createElement('div');
    group.className = 'nav-mobile-locale-region';

    const title = document.createElement('p');
    title.className = 'nav-mobile-locale-region-title';
    title.textContent = region.title;
    group.append(title);

    const list = document.createElement('ul');
    region.locales.forEach((locale) => {
      const item = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'nav-mobile-locale-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'nav-mobile-language-selector';
      radio.value = locale.href;
      radio.checked = locale.code === getCurrentLocaleCode();

      const text = document.createElement('span');
      text.textContent = locale.label;

      radio.addEventListener('change', () => {
        window.location.href = locale.href;
      });

      label.append(radio, text);
      item.append(label);
      list.append(item);
    });

    group.append(list);
    localePanel.append(group);
  });

  drawer.append(localePanel);
  root.dataset.panel = 'root';
  setLevel('root');

  return {
    drawer,
    setLevel,
    closeDrawerExtras: () => setLevel('root'),
  };
}

/**
 * loads and decorates the header/nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const { pathname } = window.location;
  const isResultsPage = pathname === sitePath('/results')
    || pathname === `${sitePath('/results')}.html`;
  block.closest('header')?.classList.toggle('is-results', isResultsPage);

  const fragment = await fetchNav();
  block.textContent = '';
  if (!fragment) return;

  const nav = document.createElement('nav');
  nav.id = 'nav';

  const sections = fragment.querySelectorAll(':scope > div');
  const [utilitySrc, logoSrc, mainSrc] = sections;

  const localePanel = buildLocalePanel({ id: 'nav-locales', modifier: 'header' });
  const localeLabel = utilitySrc?.querySelector('p')?.textContent.trim() || 'English (United States)';

  const brand = document.createElement('div');
  brand.className = 'nav-brand';
  if (utilitySrc) brand.append(buildUtilityBar(utilitySrc, localePanel));
  brand.append(localePanel);
  if (logoSrc) brand.append(buildLogoRow(logoSrc));
  nav.append(brand);

  const localeTrigger = brand.querySelector('.nav-locale');
  let localeControls = null;
  if (localeTrigger) {
    localeControls = bindLocalePanel(localeTrigger, localePanel, brand);
  }

  const mainRow = mainSrc ? buildMainNav(mainSrc) : null;
  if (mainRow) nav.append(mainRow);

  const { drawer, closeDrawerExtras } = buildMobileDrawer({
    utilityBar: brand.querySelector('.nav-utility'),
    logoRow: brand.querySelector('.nav-logo-row'),
    mainRow,
    localeLabel,
  });
  // Attach to body so position:fixed is viewport-relative (no left gap from ancestors)
  document.body.append(drawer);

  const hamburger = document.createElement('button');
  hamburger.type = 'button';
  hamburger.className = 'nav-hamburger';
  hamburger.setAttribute('aria-label', 'Open navigation');
  hamburger.setAttribute('aria-controls', 'nav');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = '<span class="nav-hamburger-icon"></span>';

  const syncDrawerGeometry = () => {
    // Keep on body so fixed positioning is viewport-relative
    if (drawer.parentElement !== document.body) {
      document.body.append(drawer);
    }
    const brandEl = nav.querySelector('.nav-brand');
    if (!brandEl) return;
    const top = Math.round(brandEl.getBoundingClientRect().bottom);
    drawer.style.setProperty('--nav-drawer-top', `${top}px`);
  };

  const setMenuOpen = (open) => {
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    hamburger.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    if (open) {
      syncDrawerGeometry();
    } else {
      drawer.removeAttribute('style');
      closeDrawerExtras();
    }
    drawer.hidden = !open;
    document.body.classList.toggle('nav-open', open);
    document.body.style.overflowY = open ? 'hidden' : '';
  };

  hamburger.addEventListener('click', () => {
    const open = hamburger.getAttribute('aria-expanded') !== 'true';
    setMenuOpen(open);
  });

  const logoRow = nav.querySelector('.nav-logo-row');
  if (logoRow) logoRow.append(hamburger);

  decorateIcons(nav);
  decorateIcons(drawer);

  isDesktop.addEventListener('change', () => {
    if (mainRow) closeAllDropdowns(mainRow);
    setMenuOpen(false);
    if (localeControls) localeControls.close();
  });

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  // Match QA utility-bar + main-nav after Hybris login
  // Utility: Welcome | My Account | Shopping Cart | Sign Out [| End Emulate]
  // Main: Online Tools + Support revealed once signed in
  const refreshAuth = () => {
    getStorefrontSession().then((session) => {
      applyAuthUtilityLinks(nav, session, drawer);
      applyAuthMainNav(nav, session, drawer);
    });
  };
  refreshAuth();
  // In-frame login does not reload the page — refresh when iframe reports auth
  window.addEventListener('storefront:auth', refreshAuth);
}

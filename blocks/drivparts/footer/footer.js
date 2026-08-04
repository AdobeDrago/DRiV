import { getMetadata } from '../../../scripts/aem.js';
import { bindLocalePanel, buildLocalePanel } from '../../../scripts/locales.js';
import { sitePath } from '../../../scripts/drivparts-paths.js';

const isDesktop = window.matchMedia('(min-width: 1025px)');

/**
 * Fetches the footer fragment HTML from the metadata path (default `/footer`).
 */
async function fetchFooter() {
  const footerMeta = getMetadata('footer');
  const defaultFooter = sitePath('/footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : defaultFooter;
  try {
    const resp = await fetch(`${footerPath}.plain.html`);
    if (!resp.ok) return null;
    const html = await resp.text();
    const container = document.createElement('div');
    container.innerHTML = html;
    return container;
  } catch {
    return null;
  }
}

/**
 * Closes all open accordion items within a container.
 * @param {Element} container
 * @param {Element} [except]
 */
function closeAccordions(container, except) {
  container.querySelectorAll('.footer-accordion-toggle[aria-expanded="true"]').forEach((toggle) => {
    const item = toggle.closest('.footer-column');
    if (item === except) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Expand');
    item?.classList.remove('is-open');
  });
}

/**
 * Wires accordion open/close for a footer column.
 * aria-expanded lives on the button (valid), not the column div.
 * @param {Element} item
 * @param {Element} toggle
 * @param {Element} columns
 * @param {() => void} [onOpen]
 * @param {() => void} [onClose]
 */
function bindAccordionItem(item, toggle, columns, onOpen, onClose) {
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    closeAccordions(columns, item);
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    toggle.setAttribute('aria-label', open ? 'Expand' : 'Collapse');
    item.classList.toggle('is-open', !open);
    if (open) onClose?.();
    else onOpen?.();
  });
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const fragment = await fetchFooter();
  block.textContent = '';
  if (!fragment) return;

  const sections = fragment.querySelectorAll(':scope > div');
  const [socialSrc, columnsSrc, bottomSrc] = sections;

  const footer = document.createElement('div');
  footer.className = 'footer-inner';

  // ---- Social bar ----
  if (socialSrc) {
    const social = document.createElement('div');
    social.className = 'footer-social';
    const content = document.createElement('div');
    content.className = 'footer-social-content';

    const heading = socialSrc.querySelector('p');
    if (heading) {
      const h = document.createElement('p');
      h.className = 'footer-social-heading';
      h.textContent = heading.textContent.trim();
      content.append(h);
    }
    const list = socialSrc.querySelector('ul');
    if (list) {
      list.className = 'footer-social-links';
      list.querySelectorAll('a').forEach((a) => {
        a.setAttribute('aria-label', a.querySelector('img')?.alt || 'social');
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
      content.append(list);
    }
    social.append(content);
    footer.append(social);
  }

  // ---- Link columns ----
  const columns = document.createElement('div');
  columns.className = 'footer-columns';

  if (columnsSrc) {
    const nodes = [...columnsSrc.children];
    let current = null;
    let columnIndex = 0;
    nodes.forEach((node) => {
      if (node.tagName === 'H5') {
        columnIndex += 1;
        current = document.createElement('div');
        current.className = 'footer-column';

        const header = document.createElement('div');
        header.className = 'footer-column-header';

        // Promote h5 → h3 so footer column headings don't skip levels
        // after the page's h2 section headings (h2 → h5 violates WCAG 1.3.1).
        const heading = document.createElement('h3');
        [...node.attributes].forEach((attr) => heading.setAttribute(attr.name, attr.value));
        heading.append(...node.childNodes);
        header.append(heading);

        const list = document.createElement('ul');
        list.className = 'footer-column-links';
        list.id = `footer-column-links-${columnIndex}`;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'footer-accordion-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', list.id);
        toggle.setAttribute('aria-label', 'Expand');
        toggle.innerHTML = '<span class="footer-accordion-icon" aria-hidden="true"></span>';
        header.append(toggle);
        current.append(header);

        const headingLink = heading.querySelector('a');
        if (headingLink) {
          // Mobile accordion: title is a real link (desktop has no toggle).
          // Toggle the list instead of navigating when accordion UI is active.
          headingLink.addEventListener('click', (e) => {
            if (isDesktop.matches) return;
            e.preventDefault();
            toggle.click();
          });

          const overview = document.createElement('li');
          const a = document.createElement('a');
          a.href = headingLink.href;
          a.textContent = 'Overview';
          overview.append(a);
          list.append(overview);
        }
        current.append(list);

        bindAccordionItem(current, toggle, columns);
        columns.append(current);
      } else if (node.tagName === 'UL' && current) {
        const list = current.querySelector('.footer-column-links');
        node.querySelectorAll(':scope > li').forEach((li) => list.append(li));
      }
    });
  }

  footer.append(columns);

  const localePanel = buildLocalePanel({ id: 'footer-locales', modifier: 'footer' });

  // ---- Bottom bar + locale controls ----
  if (bottomSrc) {
    const bottom = document.createElement('div');
    bottom.className = 'footer-bottom-bar';

    const logoP = bottomSrc.querySelector('p:first-of-type');
    if (logoP) {
      const logoLink = logoP.querySelector('a');
      if (logoLink) {
        logoLink.className = 'footer-logo';
        bottom.append(logoLink);
      }
    }

    const legal = bottomSrc.querySelector('ul');
    if (legal) {
      legal.className = 'footer-legal-links';
      // Live site's footer includes a "Cookie Settings" trigger (opens the
      // cookie-consent platform's preferences panel) right before Cookie
      // Notice -- the authored content here doesn't have one and this repo
      // has no consent-management script to wire it to, so this is a
      // placeholder link matching the same position/styling as the rest.
      const cookieNoticeLink = [...legal.querySelectorAll('a')]
        .find((a) => a.textContent.trim() === 'Cookie Notice');
      if (cookieNoticeLink) {
        // Live site renders both of these in all-caps, unlike the rest of
        // this list -- matches the reference screenshot.
        cookieNoticeLink.classList.add('footer-cookie-notice');
        if (!legal.querySelector('.footer-cookie-settings')) {
          const cookieSettingsItem = document.createElement('li');
          // Real <button>, not an <a href="#">: there's no consent-management
          // script in this repo yet to wire a click handler to, and an anchor
          // with a dummy href jumps the page to top on click for no reason.
          const cookieSettingsLink = document.createElement('button');
          cookieSettingsLink.type = 'button';
          cookieSettingsLink.className = 'footer-cookie-settings';
          cookieSettingsLink.textContent = 'Cookie Settings';
          cookieSettingsItem.append(cookieSettingsLink);
          cookieNoticeLink.closest('li').before(cookieSettingsItem);
        }
      }
      bottom.append(legal);
    }

    const paras = bottomSrc.querySelectorAll('p');
    const localeP = paras[paras.length - 1];
    const localeLabel = localeP && localeP !== logoP
      ? localeP.textContent.trim()
      : 'English (United States)';

    const localeTrigger = document.createElement('button');
    localeTrigger.type = 'button';
    localeTrigger.className = 'footer-locale';
    localeTrigger.setAttribute('aria-expanded', 'false');
    localeTrigger.setAttribute('aria-controls', localePanel.id);
    localeTrigger.setAttribute('aria-haspopup', 'true');
    localeTrigger.textContent = localeLabel;
    const caret = document.createElement('span');
    caret.className = 'footer-locale-caret';
    caret.setAttribute('aria-hidden', 'true');
    localeTrigger.append(caret);
    bottom.append(localeTrigger);

    // mobile locale accordion row
    const localeItem = document.createElement('div');
    localeItem.className = 'footer-column footer-column-locale';

    const localeHeader = document.createElement('div');
    localeHeader.className = 'footer-column-header';
    const title = document.createElement('span');
    title.className = 'footer-locale-title';
    title.textContent = localeLabel;
    localeHeader.append(title);

    const localeBody = document.createElement('div');
    localeBody.className = 'footer-column-links footer-locale-mobile-body';
    localeBody.id = 'footer-column-links-locale';

    const localeToggle = document.createElement('button');
    localeToggle.type = 'button';
    localeToggle.className = 'footer-accordion-toggle';
    localeToggle.setAttribute('aria-expanded', 'false');
    localeToggle.setAttribute('aria-controls', localeBody.id);
    localeToggle.setAttribute('aria-label', 'Expand');
    localeToggle.innerHTML = '<span class="footer-accordion-icon" aria-hidden="true"></span>';
    localeHeader.append(localeToggle);

    // Stop propagation: panel is outside .footer-locale/.locale-panel, so
    // bubbling to document would hit bindLocalePanel's outside-click and undo.
    title.addEventListener('click', (e) => {
      e.stopPropagation();
      localeToggle.click();
    });

    localeItem.append(localeHeader);
    localeItem.append(localeBody);
    columns.append(localeItem);

    const placePanelInFooter = () => {
      if (localePanel.parentElement !== footer) {
        footer.insertBefore(localePanel, bottom);
      }
    };

    bindAccordionItem(
      localeItem,
      localeToggle,
      columns,
      () => {
        localeBody.append(localePanel);
        localePanel.hidden = false;
        localePanel.classList.add('is-open');
        localeTrigger.setAttribute('aria-expanded', 'false');
      },
      () => {
        localePanel.hidden = true;
        localePanel.classList.remove('is-open');
        placePanelInFooter();
      },
    );

    localeToggle.addEventListener('click', (e) => e.stopPropagation());

    footer.append(localePanel);
    footer.append(bottom);
    bindLocalePanel(localeTrigger, localePanel, footer);

    isDesktop.addEventListener('change', () => {
      closeAccordions(columns);
      localePanel.hidden = true;
      localePanel.classList.remove('is-open');
      localeTrigger.setAttribute('aria-expanded', 'false');
      placePanelInFooter();
    });
  } else {
    footer.append(localePanel);
  }

  block.append(footer);
}

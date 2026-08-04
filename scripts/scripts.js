import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateBlocks,
  decorateTemplateAndTheme,
  getMetadata,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  sampleRUM,
  readBlockConfig,
  toClassName,
  toCamelCase,
} from './aem.js';
import { isDrivpartsPath } from './drivparts-paths.js';

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s,
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

function autolinkModals(doc) {
  doc.addEventListener('click', async (e) => {
    const origin = e.target.closest('a');
    if (origin && origin.href && origin.href.includes('/modals/')) {
      e.preventDefault();
      const { openModal } = await import(`${window.hlx.codeBasePath}/blocks/modal/modal.js`);
      openModal(origin.href);
    }
  });
}

/**
 * Turns `/widgets/...` links into widget blocks (DriveParts).
 * @param {Element} main The container element
 */
function buildWidgetAutoBlocks(main) {
  const widgetLinks = [...main.querySelectorAll('a[href*="/widgets/"]')];
  widgetLinks.forEach((link) => {
    if (link.closest('.widget')) return;
    const newLink = link.cloneNode(true);
    const widgetBlock = buildBlock('widget', { elems: [newLink] });
    const p = link.closest('p');
    if (
      p
      && p.querySelectorAll('a').length === 1
      && p.querySelector('a') === link
      && p.textContent.trim() === link.textContent.trim()
    ) {
      p.replaceWith(widgetBlock);
    } else {
      link.replaceWith(widgetBlock);
    }
  });
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    if (isDrivpartsPath()) {
      const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')]
        .filter((f) => !f.closest('.fragment'));
      if (fragments.length > 0) {
        // eslint-disable-next-line import/no-cycle
        import('../blocks/drivparts/fragment/fragment.js').then(({ loadFragment }) => {
          fragments.forEach(async (fragment) => {
            try {
              const { pathname } = new URL(fragment.href);
              const frag = await loadFragment(pathname);
              fragment.parentElement.replaceWith(...frag.children);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Fragment loading failed', error);
            }
          });
        });
      }
      buildWidgetAutoBlocks(main);
      return;
    }
    if (!main.querySelector('.hero')) buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates all sections in a container element.
 * @param {Element} main The container element
 */
function decorateSections(main) {
  main.querySelectorAll(':scope > div').forEach((section) => {
    const wrappers = [];
    let defaultContent = false;
    [...section.children].forEach((e) => {
      if (e.classList.contains('richtext')) {
        e.removeAttribute('class');
        if (!defaultContent) {
          const wrapper = document.createElement('div');
          wrapper.classList.add('default-content-wrapper');
          wrappers.push(wrapper);
          defaultContent = true;
        }
      } else if (e.tagName === 'DIV' || !defaultContent) {
        const wrapper = document.createElement('div');
        wrappers.push(wrapper);
        defaultContent = e.tagName !== 'DIV';
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers[wrappers.length - 1].append(e);
    });

    // Add wrapped content back
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.dataset.sectionStatus = 'initialized';
    section.style.display = 'none';

    // Process section metadata
    const sectionMeta = section.querySelector('div.section-metadata');
    if (sectionMeta) {
      const meta = readBlockConfig(sectionMeta);
      Object.keys(meta).forEach((key) => {
        if (key === 'style') {
          const styles = meta.style
            .split(',')
            .filter((style) => style)
            .map((style) => toClassName(style.trim()));
          styles.forEach((style) => section.classList.add(style));
        } else {
          section.dataset[toCamelCase(key)] = meta[key];
        }
      });
      sectionMeta.parentNode.remove();
    }
  });
}

/**
 * Applies a section's authored background image. The `Background` key in a
 * section's metadata is emitted by the pipeline as a `data-background`
 * attribute; here we turn that into an actual CSS background on the section.
 * @param {Element} main The main container element
 */
function decorateSectionBackgrounds(main) {
  main.querySelectorAll('.section[data-background]').forEach((section) => {
    const src = section.dataset.background;
    if (src) {
      const url = new URL(src, window.location.href);
      section.style.backgroundImage = `url("${url.pathname}${url.search}")`;
    }
  });
}

/**
 * DriveParts: ***bold+italic*** links → .button.accent.
 * aem.js decorateButtons only handles strong→primary / em→secondary.
 * @param {Element} main
 */
function drivpartsAccentButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong || !em) return;
    if (a.querySelector('img')) return;

    const p = a.closest('p');
    if (!p) return;

    a.title = a.title || a.textContent;
    const text = a.textContent.trim();
    if (p.textContent.trim() !== text) return;

    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch {
      // continue
    }

    p.classList.add('button-container');
    a.className = 'button accent';
    const outer = strong.contains(em) ? strong : em;
    outer.replaceWith(a);
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  if (isDrivpartsPath()) {
    drivpartsAccentButtons(main);
  }
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionBackgrounds(main);
  decorateBlocks(main);
}

/**
 * Starts the header block loading exactly once.
 * @param {Document} doc
 */
function startHeaderLoad(doc) {
  const header = doc.querySelector('header');
  if (header && !header.dataset.headerLoading) {
    header.dataset.headerLoading = 'true';
    loadHeader(header);
  }
}

/**
 * After Hybris login, redirects may land on legacy AEM (/content/...) or the
 * storefront iframe URL as a top-level page. Bounce back to the EDS page that
 * initiated login so Emulate Account renders inside the homepage iframe.
 */
function recoverStorefrontLoginReturn() {
  try {
    const ret = sessionStorage.getItem('fm-login-return');
    if (!ret) return;
    const { pathname } = window.location;
    const stranded = (/\/content\//i.test(pathname)
      || /\/fmstorefront\//i.test(pathname))
      && !/\/cart\b/i.test(pathname);
    if (!stranded) {
      sessionStorage.removeItem('fm-login-return');
      return;
    }
    sessionStorage.removeItem('fm-login-return');
    window.location.replace(ret);
  } catch (e) {
    // ignore
  }
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  doc.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  let drivpartsStyles;
  if (isDrivpartsPath()) {
    doc.body.classList.add('drivparts');
    drivpartsStyles = loadCSS(`${window.hlx.codeBasePath}/styles/drivparts.css`);
  }
  if (getMetadata('breadcrumbs').toLowerCase() === 'true') {
    doc.body.dataset.breadcrumbs = true;
  }
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    // Apply the DriveParts brand stylesheet before revealing the body so the
    // page never flashes the default (MOOG) styles shipped in styles.css.
    if (drivpartsStyles) await drivpartsStyles;
    doc.body.classList.add('appear');

    /*
     * If the first section has no authored image, start header load early
     * (DriveParts LCP optimization for pages where the logo is LCP).
     */
    const firstSection = main.querySelector('.section');
    if (firstSection && !firstSection.querySelector('picture, img')) {
      startHeaderLoad(doc);
    }

    await loadSection(firstSection, waitForFirstImage);
  }

  sampleRUM.enhance();

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  autolinkModals(doc);

  // No-op if loadEager() already started it.
  startHeaderLoad(doc);

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadSidekick() {
  if (document.querySelector('aem-sidekick')) {
    import('./sidekick.js');
    return;
  }

  document.addEventListener('sidekick-ready', () => {
    import('./sidekick.js');
  });
}

async function loadPage() {
  recoverStorefrontLoginReturn();
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
  loadSidekick();
}

// UE Editor support before page load
if (/\.(stage-ue|ue)\.da\.live$/.test(window.location.hostname)) {
  // eslint-disable-next-line import/no-unresolved
  await import(`${window.hlx.codeBasePath}/ue/scripts/ue.js`).then(({ default: ue }) => ue());
}

loadPage();

(function da() {
  const { searchParams } = new URL(window.location.href);

  const lp = searchParams.get('dapreview');
  // eslint-disable-next-line import/no-unresolved
  if (lp) import('https://da.live/scripts/dapreview.js').then((mod) => mod.default(loadPage));

  const exp = searchParams.get('daexperiment');
  // eslint-disable-next-line import/no-unresolved
  if (exp) import('https://da.live/nx/public/plugins/exp/exp.js');
}());

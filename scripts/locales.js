/** Locale options matching www.drivparts.com region selector */
export const LOCALE_REGIONS = [
  {
    title: 'Europe, Middle East, Africa',
    className: 'locale-panel-region-emea',
    locales: [
      { label: 'Română', href: 'https://www.drivparts.com/ro-ro/', code: 'ro_RO' },
      { label: 'English', href: 'https://www.drivparts.com/en-eu/', code: 'en_EU' },
      { label: 'Français', href: 'https://www.drivparts.com/fr-fr/', code: 'fr_FR' },
      { label: 'Deutsch', href: 'https://www.drivparts.com/de-de/', code: 'de_DE' },
      { label: 'Italiano', href: 'https://www.drivparts.com/it-it/', code: 'it_IT' },
      { label: 'Nederlands', href: 'https://www.drivparts.com/nl-nl/', code: 'nl_NL' },
      { label: 'Polski', href: 'https://www.drivparts.com/pl-pl/', code: 'pl_PL' },
      { label: 'Pусский', href: 'https://www.drivparts.com/ru-ru/', code: 'ru_RU' },
      { label: 'English (South Africa)', href: 'https://www.drivparts.com/en-za/', code: 'en_ZA' },
      { label: 'Español', href: 'https://www.drivparts.com/es-es/', code: 'es_ES' },
      { label: 'Українська', href: 'https://www.drivparts.com/uk-ua/', code: 'uk_UA' },
      { label: 'Česko (Česká republika)', href: 'https://www.drivparts.com/cs-cz/', code: 'cs_CZ' },
    ],
  },
  {
    title: 'North America',
    className: 'locale-panel-region-na',
    locales: [
      { label: 'Español (Mexico)', href: 'https://www.drivparts.com/es-mx/', code: 'es_MX' },
      { label: 'English (United States)', href: 'https://www.drivparts.com/', code: 'en_US' },
    ],
  },
  {
    title: 'Asia Pacific',
    className: 'locale-panel-region-apac',
    locales: [
      { label: '中国人', href: 'https://www.drivparts.cn/', code: 'zh_CN' },
      { label: 'English (India)', href: 'https://www.drivparts.com/en-in/', code: 'en_IN' },
    ],
  },
];

export const CURRENT_LOCALE = 'en_US';

/**
 * Builds the region / language selector panel.
 * @param {Object} [options]
 * @param {string} [options.id] Element id
 * @param {string} [options.modifier] Extra BEM-style modifier class (e.g. 'footer')
 * @returns {HTMLElement}
 */
export function buildLocalePanel({ id = 'locale-panel', modifier = '' } = {}) {
  const panel = document.createElement('div');
  panel.className = modifier ? `locale-panel locale-panel-${modifier}` : 'locale-panel';
  panel.id = id;
  panel.hidden = true;

  const inner = document.createElement('div');
  inner.className = 'locale-panel-inner';
  panel.append(inner);

  LOCALE_REGIONS.forEach((region) => {
    const col = document.createElement('div');
    col.className = `locale-panel-region ${region.className}`;

    const heading = document.createElement('p');
    heading.className = 'locale-panel-region-title';
    heading.textContent = region.title;
    col.append(heading);

    const list = document.createElement('ul');
    region.locales.forEach((locale) => {
      const item = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'locale-panel-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `${id}-language-selector`;
      radio.className = 'locale-panel-radio';
      radio.value = locale.href;
      radio.checked = locale.code === CURRENT_LOCALE;

      const text = document.createElement('span');
      text.className = 'locale-panel-option-label';
      text.textContent = locale.label;

      radio.addEventListener('change', () => {
        window.location.href = locale.href;
      });

      label.append(radio, text);
      item.append(label);
      list.append(item);
    });

    col.append(list);
    inner.append(col);
  });

  return panel;
}

/**
 * Wires open / close behavior for a locale panel.
 * @param {Element} trigger Toggle button
 * @param {Element} panel Locale panel
 * @param {Element} root Root used for outside-click checks
 * @returns {{ close: () => void }}
 */
export function bindLocalePanel(trigger, panel, root) {
  const setOpen = (open) => {
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
    panel.classList.toggle('is-open', open);
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(trigger.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('click', (e) => {
    if (panel.hidden) return;
    if (root.contains(e.target) && (trigger.contains(e.target) || panel.contains(e.target))) {
      return;
    }
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  return { close: () => setOpen(false) };
}

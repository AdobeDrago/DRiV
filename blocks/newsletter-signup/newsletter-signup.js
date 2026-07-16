const MAIL_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/>
  <path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ARROW_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * Placeholder subscribe handler. Not wired to a backend yet — swap the body
 * for a real request when the newsletter API is available.
 * @param {string} email the submitted email address
 */
async function subscribe(email) {
  // TODO: wire up to the newsletter subscription endpoint, e.g.
  // return fetch('/newsletter/subscribe', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ email }),
  // });
  // eslint-disable-next-line no-console
  console.log('[newsletter-signup] placeholder submit:', email);
  return Promise.resolve();
}

/**
 * Newsletter signup — copy on the left, a labelled (non-functional) email
 * capture form on the right.
 * @param {Element} block the newsletter-signup block element
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  const [content, formCell] = row.children;
  content?.classList.add('newsletter-content');
  if (!formCell) return;
  formCell.classList.add('newsletter-form');

  // the "SIGN UP FOR OUR NEWSLETTER" paragraph becomes the labelled heading
  const label = formCell.querySelector('p');
  if (label) {
    label.classList.add('newsletter-label');
    const icon = document.createElement('span');
    icon.className = 'newsletter-label-icon';
    icon.innerHTML = MAIL_ICON;
    label.prepend(icon);
  }

  // build the (placeholder) capture form
  const form = document.createElement('form');
  form.className = 'newsletter-form-control';
  form.noValidate = true;
  form.innerHTML = `
    <input type="email" name="email" autocomplete="email"
      placeholder="Your email address" aria-label="Your email address" required>
    <button type="submit" aria-label="Sign up">${ARROW_ICON}</button>
  `;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    if (!email) return;
    subscribe(email);
  });

  formCell.append(form);
}

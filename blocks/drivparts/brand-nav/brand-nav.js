/**
 * DriveParts brand-nav block.
 *
 * The brands directory left rail: a "BRANDS" header (with a back affordance)
 * over a vertical list of brand links. Mirrors the sub-navigation shown on
 * drivparts.com/brands.
 *
 * Authored structure — one link per row:
 *   [ <a href="/drivparts/brands/abex">Abex</a> ]
 *   [ <a href="/drivparts/brands/monroe">Monroe</a> ]
 *   ...
 * Optionally the first row may hold a plain-text label to override the
 * default "BRANDS" heading.
 *
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];

  // optional heading override: a first row with text but no link
  let headingText = 'Brands';
  if (rows.length && !rows[0].querySelector('a') && rows[0].textContent.trim()) {
    headingText = rows[0].textContent.trim();
    rows.shift().remove();
  }

  // collect the authored links
  const links = rows
    .map((row) => row.querySelector('a[href]'))
    .filter(Boolean);

  // build the rail: heading + list
  const heading = document.createElement('p');
  heading.className = 'brand-nav-heading';
  const back = document.createElement('span');
  back.className = 'brand-nav-back';
  back.setAttribute('aria-hidden', 'true');
  heading.append(back, document.createTextNode(headingText));

  const list = document.createElement('ul');
  list.className = 'brand-nav-list';
  links.forEach((a) => {
    const li = document.createElement('li');
    // overwrite rather than add: decorateButtons() already stamped a lone
    // link in its own <p>/<div> as `button` (the global MOOG-pill style)
    // before this block's decorate() ran
    a.className = 'brand-nav-link';
    li.append(a);
    list.append(li);
  });

  block.replaceChildren(heading, list);
}

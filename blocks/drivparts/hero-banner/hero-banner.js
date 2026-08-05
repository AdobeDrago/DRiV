/**
 * Hero-banner block.
 *
 * Source (drivparts.com OVERDRiV banner) is a single composite banner image
 * where the entire banner is one clickable link (the "Start Earning Rewards"
 * CTA is baked into the artwork). The authored content provides the banner
 * <picture> plus a CTA <a>. To match the source we make the whole banner
 * clickable and keep the CTA label as the link's accessible name rather than
 * rendering a duplicate button on top of the artwork.
 *
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const picture = block.querySelector('picture');
  const link = block.querySelector('a[href]');

  if (!picture) {
    block.classList.add('no-image');
  }

  // If we have both a banner image and a CTA link, make the whole banner the
  // link (matches the source, avoids a duplicate CTA over the baked-in artwork).
  if (picture && link) {
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.className = 'hero-banner-link';
    if (link.target) anchor.target = link.target;
    // Use the CTA text as the accessible label for the image-only link.
    anchor.setAttribute('aria-label', link.textContent.trim() || (picture.querySelector('img')?.alt ?? ''));

    anchor.appendChild(picture);
    // Replace the original cell contents with the single wrapping anchor.
    const cell = link.closest('div') || block;
    // Remove the original link (and its paragraph wrapper if now empty).
    const linkWrapper = link.parentElement;
    link.remove();
    if (linkWrapper && linkWrapper !== cell && linkWrapper.textContent.trim() === '' && !linkWrapper.querySelector('img, picture')) {
      linkWrapper.remove();
    }
    cell.querySelectorAll('p:empty').forEach((p) => p.remove());
    cell.prepend(anchor);
  }
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let resizeObserver;
export function animateNavigation() {
  resizeObserver?.disconnect();
  const nav = document.querySelector('.top-nav');
  if (!nav) return;
  let marker = nav.querySelector('.nav-selection');
  const initial = !marker;
  if (!marker) {
    marker = document.createElement('span');
    marker.className = 'nav-selection';
    marker.setAttribute('aria-hidden', 'true');
    nav.prepend(marker);
  }
  nav.classList.add('has-selection');
  const update = () => {
    const selected = nav.querySelector('a.current');
    marker.style.opacity = selected ? '1' : '0';
    if (!selected) return;
    const rect = selected.getBoundingClientRect(), host = nav.getBoundingClientRect();
    Object.assign(marker.style, {left:'0px',top:'0px',transform:`translate(${rect.left-host.left+nav.scrollLeft}px, ${rect.top-host.top}px)`,width:`${rect.width}px`,height:`${rect.height}px`});
  };
  if (initial) marker.style.transition = 'none';
  update();
  if (initial) { marker.getBoundingClientRect(); marker.style.transition = ''; }
  resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(nav);
  nav.querySelectorAll('a').forEach(link => resizeObserver.observe(link));
}
export function revealContent(element) {
  if (!element || reduced()) return;
  element.getAnimations().forEach(animation => animation.cancel());
  element.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
}

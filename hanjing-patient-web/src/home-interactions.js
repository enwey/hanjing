export function setupHome(root, signal) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = new Set();
  const reveal = el => {
    if (reduced.matches) return;
    const animation = el.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:750,easing:'cubic-bezier(.22,.68,0,1)'});
    motion.add(animation); animation.onfinish = () => motion.delete(animation);
  };
  root.querySelectorAll('.hc-intro,.hc-photos').forEach(reveal);
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {if(entry.isIntersecting){reveal(entry.target);observer.unobserve(entry.target);}});
  },{threshold:.12});
  root.querySelectorAll('.hc-section-head,.hc-process-photo,.hc-device,.hc-faq,.hc-book').forEach(el=>observer.observe(el));
  reduced.addEventListener('change',()=>{if(reduced.matches)motion.forEach(a=>a.cancel());},{signal});
  root.querySelectorAll('.hc-faq-question').forEach(button => {
    button.addEventListener('click', () => {
      const opening = button.getAttribute('aria-expanded') !== 'true';
      root.querySelectorAll('.hc-faq-question').forEach(other => {
        const open = other === button && opening;
        const answer = document.getElementById(other.getAttribute('aria-controls'));
        other.setAttribute('aria-expanded', String(open));
        other.querySelector('span').textContent = open ? '−' : '+';
        answer.classList.toggle('is-open',open);
        answer.setAttribute('aria-hidden',String(!open));
      });
    },{signal});
  });
  signal.addEventListener('abort',()=>{observer.disconnect();motion.forEach(a=>a.cancel());},{once:true});
  const carousel = root.querySelector('.hc-carousel');
  if (!carousel) return;
  const images = [...carousel.querySelectorAll('.hc-carousel-images img')];
  const dots = [...carousel.querySelectorAll('[data-slide]')];
  let index = 0;
  const show = n => {index = n;images.forEach((img,i)=>{img.classList.toggle('is-active',i===n);img.setAttribute('aria-hidden',String(i!==n));});dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===n)));};
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>show(i),{signal}));
  const timer = setInterval(()=>{if(!document.hidden)show((index+1)%images.length);},4500);
  signal.addEventListener('abort',()=>{clearInterval(timer);},{once:true});
}

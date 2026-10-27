/* 摸鱼一号宣传站交互脚本 */
(function () {
  'use strict';

  // 滚动渐入动画
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(function (el) {
    observer.observe(el);
  });

  // 移动端导航切换
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  // 导航栏滚动阴影
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 10) {
        nav.style.boxShadow = '0 4px 30px rgba(0,0,0,0.4)';
      } else {
        nav.style.boxShadow = 'none';
      }
    }, { passive: true });
  }

  // 背景光晕跟随鼠标
  const glow1 = document.querySelector('.glow-1');
  const glow2 = document.querySelector('.glow-2');
  if (glow1 && glow2) {
    window.addEventListener('mousemove', function (e) {
      const x = (e.clientX / window.innerWidth - 0.5) * 40;
      const y = (e.clientY / window.innerHeight - 0.5) * 40;
      glow1.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      glow2.style.transform = 'translate(' + (-x) + 'px, ' + (-y) + 'px)';
    }, { passive: true });
  }
})();

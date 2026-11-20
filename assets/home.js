// Start each demonstration when its artwork is visible, including on narrow screens.
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const replay = document.querySelector('.replay');
const studio = document.querySelector('.studio-stage');
const stages = document.querySelectorAll('.stage');
let observer;

function play(stage) {
  if (motion.matches) return;
  stage.classList.remove('playing');
  void stage.offsetWidth;
  stage.classList.add('playing');
}

function prepare() {
  observer?.disconnect();
  replay.hidden = motion.matches;
  stages.forEach(stage => stage.classList.remove('playing'));
  if (motion.matches) return;
  if (!('IntersectionObserver' in window)) {
    stages.forEach(play);
    return;
  }
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      play(entry.target);
      observer.unobserve(entry.target);
    }
  }, {threshold: 0.35});
  stages.forEach(stage => observer.observe(stage));
}

replay.addEventListener('click', () => play(studio));
motion.addEventListener('change', prepare);
if (document.readyState === 'complete') prepare();
else window.addEventListener('load', prepare, {once: true});

const samples = [...document.querySelectorAll('.barcode-sample')];
const controls = document.querySelector('.slides');
const choices = [...controls.querySelectorAll('[data-slide]')];
const pause = controls.querySelector('.pause');
let sampleIndex = 0;
let paused = false;
let timer;

function selectSample(index) {
  sampleIndex = index;
  samples.forEach((sample, i) => {
    sample.classList.toggle('current', i === index);
    sample.setAttribute('aria-hidden', String(i !== index));
    choices[i].setAttribute('aria-pressed', String(i === index));
  });
}

function scheduleSample() {
  clearInterval(timer);
  pause.hidden = motion.matches;
  pause.classList.toggle('stopped', paused);
  pause.setAttribute('aria-label', paused ? 'เล่นภาพตัวอย่างต่อ' : 'พักการสลับภาพ');
  if (!paused && !motion.matches && !document.hidden) {
    timer = setInterval(() => selectSample((sampleIndex + 1) % samples.length), 4200);
  }
}

choices.forEach((button, index) => button.addEventListener('click', () => {
  selectSample(index);
  paused = true;
  scheduleSample();
}));
pause.addEventListener('click', () => { paused = !paused; scheduleSample(); });
document.addEventListener('visibilitychange', scheduleSample);
motion.addEventListener('change', scheduleSample);
controls.hidden = false;
scheduleSample();

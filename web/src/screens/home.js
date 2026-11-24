export function homeHtml() {
  return `
  <section id="home" class="panel rise home">
    <h2>Write in handwriting</h2>
    <p class="muted">Type your words and get a handwritten page with the demo hand — no setup. Or make a hand from your own writing so every page is yours.</p>
    <div class="home-actions">
      <button type="button" id="btnDemo">Write a page</button>
      <button type="button" class="ghost" id="btnMakeHand">Make my handwriting</button>
    </div>
    <div id="homeMsg" aria-live="polite"></div>
  </section>`;
}

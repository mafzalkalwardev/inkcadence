export function homeHtml() {
  return `
  <section id="home" class="panel rise home">
    <h2>Your handwriting</h2>
    <p class="muted">Make a hand from a letter sheet, or try the demo and write a page.</p>
    <div class="home-actions">
      <button type="button" id="btnMakeHand">Make my handwriting</button>
      <button type="button" class="ghost" id="btnDemo">Try the demo hand</button>
    </div>
    <div id="homeMsg"></div>
  </section>`;
}

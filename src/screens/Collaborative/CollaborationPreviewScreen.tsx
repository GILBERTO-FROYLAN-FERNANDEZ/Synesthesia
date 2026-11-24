import { href } from '../../app/router';
import styles from './CollaborationPreviewScreen.module.css';

/** Concept only: does not mount the live collaboration prototype or request media access. */
export function CollaborationPreviewScreen() {
  return (
    <section className={styles.page} aria-labelledby="collaboration-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Future feature</span>
          <h1 id="collaboration-title">Collaborative Performance</h1>
          <p>Explore a shared instrument where one person creates movement and another shapes its visual and sound response.</p>
        </div>
        <span className={styles.status}>Under development</span>
      </header>
      <div className={styles.notice} role="note">
        <strong>Coming soon</strong>
        <p>Collaboration is not available in this version. The concept demo below illustrates a possible future workflow; it is not a live session.</p>
      </div>
      <figure className={styles.demo} aria-labelledby="concept-title">
        <div className={styles.demoHeader}>
          <div><span className={styles.eyebrow}>Concept demo</span><h2 id="concept-title">Create together</h2></div>
          <span className={styles.previewLabel}>Illustrative preview · non-interactive</span>
        </div>
        <div className={styles.workspace}>
          <div className={styles.panel}>
            <span className={styles.eyebrow}>Performer A</span>
            <h3>Movement input</h3>
            <div className={styles.camera} aria-hidden="true">
              <svg viewBox="0 0 180 135" focusable="false">
                <rect width="180" height="135" fill="#152d3a" />
                {[1, 5].map((i) => <rect key={i} x={(i % 3) * 60} y={Math.floor(i / 3) * 45} width="60" height="45" fill="#5ab7c4" opacity=".25" />)}
                <path d="M60 0V135M120 0V135M0 45H180M0 90H180" stroke="#78c9d1" opacity=".65" />
                <g stroke="#c1e3e8" strokeWidth="4" strokeLinecap="round" fill="none">
                  <circle cx="90" cy="33" r="11" /><path d="M90 44V85M90 55L64 33 42 20M90 55l28 8 31-15M90 85l-23 39m23-39 24 39" />
                </g>
                <circle cx="42" cy="20" r="5" fill="#f1b84a"/><circle cx="149" cy="48" r="5" fill="#f1b84a"/>
              </svg>
            </div>
            <p>Move through the camera space.</p>
          </div>
          <div className={`${styles.panel} ${styles.output}`}>
            <span className={styles.eyebrow}>Shared composition</span>
            <h3>Visual + sound</h3>
            <div className={styles.art} aria-hidden="true">
              <svg viewBox="0 0 380 214" preserveAspectRatio="xMidYMid slice" focusable="false">
                <rect width="380" height="214" fill="#0c222f" />
                <g className={styles.wake} fill="none" strokeLinecap="round">
                  {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M-30 ${140 + i * 8} C 80 ${-24 + i * 16}, 165 ${280 - i * 10}, 264 ${70 + i * 8} S 380 ${35 + i * 8}, 420 ${80 + i * 12}`} stroke={i % 3 === 0 ? '#e1c480' : '#6abcca'} strokeOpacity={0.25 + i * 0.05} strokeWidth={i % 3 === 0 ? 2 : 3} />)}
                </g>
              </svg>
            </div>
            <p>Experience movement through a shared audiovisual response.</p>
          </div>
          <div className={styles.panel}>
            <span className={styles.eyebrow}>Collaborator B</span>
            <h3>Shape the response</h3>
            <div className={styles.mockControls} aria-hidden="true">
              <div><span>Visual material</span><span>Water</span></div>
              <div><span>Motion response</span><span>Trail</span></div>
              <div><span>Tone</span><span>Glass</span></div>
              <div><span>Scale</span><span>Pentatonic</span></div>
              <div><span>Response</span><i className={styles.mockSlider} /></div>
            </div>
            <p>Adjust materials and sound while the performer moves.</p>
          </div>
        </div>
        <figcaption>Concept illustration only. No camera, microphone, audio engine, recording, or live controls are active.</figcaption>
      </figure>
      <footer className={styles.footer}>
        <p>Want to try the working instrument? Solo Performance is available now.</p>
        <a className={styles.link} href={href('/perform')}>Go to Solo Performance</a>
      </footer>
    </section>
  );
}

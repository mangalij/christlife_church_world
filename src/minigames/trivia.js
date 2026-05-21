import { openMinigameModal, showToast } from "../ui.js";
import { addXP, addMember } from "../growth.js";
import { isMobile } from "../main.js";

const QUESTIONS = [
  // ---- Original 10 ----
  { q: "Who built the ark?", options: ["Moses", "Noah", "Abraham", "David"], a: 1 },
  { q: "How many disciples did Jesus have?", options: ["10", "12", "7", "14"], a: 1 },
  { q: "What city was Jesus born in?", options: ["Jerusalem", "Nazareth", "Bethlehem", "Jericho"], a: 2 },
  { q: "Who was swallowed by a great fish?", options: ["Elijah", "Paul", "Jonah", "Daniel"], a: 2 },
  { q: "Which book comes first in the Bible?", options: ["Psalms", "Genesis", "Matthew", "Exodus"], a: 1 },
  { q: "Who denied Jesus three times?", options: ["John", "James", "Peter", "Andrew"], a: 2 },
  { q: "What did Jesus turn water into?", options: ["Milk", "Wine", "Oil", "Honey"], a: 1 },
  { q: "How many days was Jesus in the tomb?", options: ["1", "2", "3", "4"], a: 2 },
  { q: "Who wrote most of the NT letters?", options: ["Peter", "John", "Luke", "Paul"], a: 3 },
  { q: "What is the shortest Bible verse?", options: ["Amen", "Jesus wept", "Pray always", "Fear not"], a: 1 },

  // ---- Old Testament ----
  { q: "Who led the Israelites out of Egypt?", options: ["Joshua", "Aaron", "Moses", "Samuel"], a: 2 },
  { q: "Which sea did God part for the Israelites?", options: ["Dead Sea", "Sea of Galilee", "Mediterranean", "Red Sea"], a: 3 },
  { q: "How many plagues struck Egypt?", options: ["7", "10", "12", "40"], a: 1 },
  { q: "Who was the first man God created?", options: ["Adam", "Cain", "Seth", "Enoch"], a: 0 },
  { q: "Who was Adam's wife?", options: ["Sarah", "Rebekah", "Eve", "Rachel"], a: 2 },
  { q: "What forbidden fruit did Eve eat?", options: ["Apple", "Fig", "Grape", "The Bible doesn't say"], a: 3 },
  { q: "Who killed his brother Abel?", options: ["Esau", "Cain", "Joseph", "Saul"], a: 1 },
  { q: "How old was Methuselah when he died?", options: ["365", "600", "969", "1000"], a: 2 },
  { q: "Who was asked to sacrifice his son Isaac?", options: ["Jacob", "Abraham", "Lot", "Isaac himself"], a: 1 },
  { q: "What was Abraham's wife's name?", options: ["Hagar", "Rebekah", "Sarah", "Leah"], a: 2 },
  { q: "Who tricked his brother out of a birthright?", options: ["Esau", "Jacob", "Joseph", "Reuben"], a: 1 },
  { q: "How many sons did Jacob have?", options: ["10", "12", "7", "15"], a: 1 },
  { q: "Whose colorful coat made his brothers jealous?", options: ["Reuben", "Benjamin", "Joseph", "Judah"], a: 2 },
  { q: "Who interpreted Pharaoh's dreams?", options: ["Daniel", "Joseph", "Moses", "Aaron"], a: 1 },
  { q: "On what mountain did Moses receive the Ten Commandments?", options: ["Mt. Sinai", "Mt. Zion", "Mt. Carmel", "Mt. Nebo"], a: 0 },
  { q: "Who succeeded Moses as leader of Israel?", options: ["Caleb", "Aaron", "Joshua", "Samuel"], a: 2 },
  { q: "Which walls fell down when the Israelites marched around them?", options: ["Babylon", "Jericho", "Nineveh", "Jerusalem"], a: 1 },
  { q: "What did Samson use as a weapon against the Philistines?", options: ["Sling", "Sword", "Donkey's jawbone", "Spear"], a: 2 },
  { q: "Who cut Samson's hair?", options: ["Delilah", "Jezebel", "Bathsheba", "Ruth"], a: 0 },
  { q: "Who was the first king of Israel?", options: ["David", "Saul", "Solomon", "Samuel"], a: 1 },
  { q: "Who killed Goliath?", options: ["Saul", "Jonathan", "David", "Samson"], a: 2 },
  { q: "What did David use to kill Goliath?", options: ["A sword", "A spear", "A sling and stone", "His hands"], a: 2 },
  { q: "Who was David's best friend?", options: ["Solomon", "Jonathan", "Absalom", "Joab"], a: 1 },
  { q: "Who was the wisest king of Israel?", options: ["David", "Solomon", "Hezekiah", "Josiah"], a: 1 },
  { q: "Who built the first temple in Jerusalem?", options: ["David", "Solomon", "Nehemiah", "Ezra"], a: 1 },
  { q: "Which prophet was taken to heaven in a chariot of fire?", options: ["Elisha", "Isaiah", "Elijah", "Ezekiel"], a: 2 },
  { q: "Whose lions' den experience ended in deliverance?", options: ["Joseph", "Daniel", "Moses", "Job"], a: 1 },
  { q: "Who were thrown into a fiery furnace?", options: ["Daniel and friends", "Shadrach, Meshach, Abednego", "Peter and John", "David and Jonathan"], a: 1 },
  { q: "How many books are in the Old Testament?", options: ["27", "39", "40", "66"], a: 1 },
  { q: "Which book contains 150 songs/prayers?", options: ["Proverbs", "Psalms", "Lamentations", "Song of Solomon"], a: 1 },
  { q: "Who wrote most of the Psalms?", options: ["Moses", "Solomon", "David", "Asaph"], a: 2 },
  { q: "Who was the queen that saved her people from genocide?", options: ["Ruth", "Deborah", "Esther", "Miriam"], a: 2 },
  { q: "Whose mother-in-law was Naomi?", options: ["Esther", "Hannah", "Ruth", "Rachel"], a: 2 },
  { q: "Which prophet preached to Nineveh?", options: ["Amos", "Jonah", "Hosea", "Micah"], a: 1 },
  { q: "Who lost everything yet kept his faith in God?", options: ["Job", "Jeremiah", "Hosea", "Habakkuk"], a: 0 },
  { q: "Which prophet had a vision of dry bones coming to life?", options: ["Isaiah", "Ezekiel", "Daniel", "Zechariah"], a: 1 },
  { q: "Who was the female judge of Israel?", options: ["Miriam", "Deborah", "Huldah", "Anna"], a: 1 },
  { q: "Which prophet anointed David as king?", options: ["Nathan", "Samuel", "Elijah", "Gad"], a: 1 },
  { q: "What did God create on the seventh day?", options: ["Animals", "Humans", "Nothing — He rested", "Stars"], a: 2 },
  { q: "How many people were on Noah's ark?", options: ["4", "6", "8", "12"], a: 2 },

  // ---- New Testament ----
  { q: "Who was Jesus' earthly father?", options: ["Zechariah", "Joseph", "Simeon", "Nicodemus"], a: 1 },
  { q: "Who was Jesus' mother?", options: ["Mary", "Martha", "Elizabeth", "Anna"], a: 0 },
  { q: "Who baptized Jesus?", options: ["Peter", "John the Baptist", "James", "Paul"], a: 1 },
  { q: "In what river was Jesus baptized?", options: ["Nile", "Jordan", "Euphrates", "Tigris"], a: 1 },
  { q: "How long did Jesus fast in the wilderness?", options: ["7 days", "21 days", "40 days", "60 days"], a: 2 },
  { q: "Who tempted Jesus in the wilderness?", options: ["The Pharisees", "Satan", "Herod", "Pilate"], a: 1 },
  { q: "What was Matthew's profession before following Jesus?", options: ["Fisherman", "Tax collector", "Carpenter", "Tentmaker"], a: 1 },
  { q: "Who was the disciple Jesus loved?", options: ["Peter", "John", "James", "Andrew"], a: 1 },
  { q: "Which disciple betrayed Jesus?", options: ["Peter", "Thomas", "Judas Iscariot", "Bartholomew"], a: 2 },
  { q: "For how many pieces of silver was Jesus betrayed?", options: ["20", "30", "40", "50"], a: 1 },
  { q: "Who carried Jesus' cross?", options: ["Peter", "Simon of Cyrene", "Joseph of Arimathea", "Nicodemus"], a: 1 },
  { q: "Who buried Jesus in his own tomb?", options: ["Nicodemus", "Peter", "Joseph of Arimathea", "John"], a: 2 },
  { q: "Who first saw the risen Jesus?", options: ["Peter", "John", "Mary Magdalene", "Thomas"], a: 2 },
  { q: "Which disciple doubted Jesus' resurrection?", options: ["Peter", "Thomas", "Philip", "James"], a: 1 },
  { q: "How many people did Jesus feed with 5 loaves and 2 fish?", options: ["500", "1000", "3000", "5000"], a: 3 },
  { q: "On what mountain did Jesus give the Sermon on the Mount?", options: ["Sinai", "Zion", "Olives", "The Bible doesn't name it"], a: 3 },
  { q: "What prayer did Jesus teach His disciples?", options: ["Sinner's Prayer", "The Lord's Prayer", "Prayer of Jabez", "Serenity Prayer"], a: 1 },
  { q: "Who walked on water with Jesus (briefly)?", options: ["John", "Peter", "James", "Andrew"], a: 1 },
  { q: "Which sister of Lazarus sat at Jesus' feet?", options: ["Martha", "Mary", "Salome", "Joanna"], a: 1 },
  { q: "Whom did Jesus raise from the dead after 4 days?", options: ["Jairus' daughter", "Widow's son at Nain", "Lazarus", "Tabitha"], a: 2 },
  { q: "Who was Jesus' cousin?", options: ["Andrew", "John the Baptist", "James", "Stephen"], a: 1 },
  { q: "What is the first commandment with a promise?", options: ["Do not steal", "Honor your father and mother", "Love the Lord your God", "Do not murder"], a: 1 },
  { q: "Who was the first Christian martyr?", options: ["James", "Stephen", "Peter", "Paul"], a: 1 },
  { q: "What was Paul's name before his conversion?", options: ["Silas", "Barnabas", "Saul", "Timothy"], a: 2 },
  { q: "On what road did Paul encounter Jesus?", options: ["Jericho", "Emmaus", "Damascus", "Galilee"], a: 2 },
  { q: "Which church received the most letters from Paul?", options: ["Rome", "Corinth", "Ephesus", "Galatia"], a: 1 },
  { q: "Who wrote the book of Revelation?", options: ["Peter", "Paul", "John", "Jude"], a: 2 },
  { q: "On what island did John receive the Revelation?", options: ["Crete", "Cyprus", "Patmos", "Malta"], a: 2 },
  { q: "How many churches are addressed in Revelation?", options: ["3", "7", "10", "12"], a: 1 },
  { q: "Which gospel is the shortest?", options: ["Matthew", "Mark", "Luke", "John"], a: 1 },
  { q: "Which gospel writer was a physician?", options: ["Matthew", "Mark", "Luke", "John"], a: 2 },
  { q: "How many books are in the New Testament?", options: ["21", "27", "39", "66"], a: 1 },
  { q: "What fruit of the Spirit comes first in Galatians 5?", options: ["Joy", "Peace", "Love", "Patience"], a: 2 },
  { q: "How many fruits of the Spirit are listed in Galatians 5?", options: ["7", "9", "10", "12"], a: 1 },
  { q: "What is the 'Greatest Commandment'?", options: ["Don't murder", "Love God with all your heart", "Honor your parents", "Keep the Sabbath"], a: 1 },
  { q: "What feast was Jesus celebrating at the Last Supper?", options: ["Pentecost", "Passover", "Hanukkah", "Tabernacles"], a: 1 },
  { q: "Who governed Judea when Jesus was crucified?", options: ["Herod the Great", "Pontius Pilate", "Caesar Augustus", "Felix"], a: 1 },
  { q: "What did the Holy Spirit appear as at Pentecost?", options: ["A dove", "A cloud", "Tongues of fire", "A still small voice"], a: 2 },
  { q: "How many men were baptized at Pentecost?", options: ["120", "500", "3000", "5000"], a: 2 },

  // ---- Verses, themes, & key terms ----
  { q: "\"For God so loved the world…\" comes from which book?", options: ["Romans", "John", "Matthew", "1 John"], a: 1 },
  { q: "Which Psalm begins \"The Lord is my shepherd\"?", options: ["Psalm 1", "Psalm 23", "Psalm 51", "Psalm 91"], a: 1 },
  { q: "Where do you find the 'Love Chapter'?", options: ["John 3", "1 Corinthians 13", "Romans 8", "Ephesians 5"], a: 1 },
  { q: "Which chapter is the 'Faith Hall of Fame'?", options: ["Romans 8", "Hebrews 11", "Galatians 5", "James 2"], a: 1 },
  { q: "How many beatitudes are there?", options: ["7", "8", "10", "12"], a: 1 },
  { q: "What does 'gospel' mean?", options: ["Holy book", "Good news", "Old story", "New law"], a: 1 },
  { q: "What does 'Immanuel' mean?", options: ["Prince of Peace", "God with us", "Anointed One", "Lamb of God"], a: 1 },
  { q: "What does 'Messiah' mean?", options: ["Savior", "Anointed One", "Teacher", "King"], a: 1 },
  { q: "What does 'amen' mean?", options: ["Goodbye", "So be it", "Hallelujah", "Forever"], a: 1 },
  { q: "How many commandments did God give Moses?", options: ["7", "10", "12", "40"], a: 1 },
  { q: "Which commandment is about keeping the Sabbath?", options: ["3rd", "4th", "5th", "6th"], a: 1 },
  { q: "What does 'grace' mean in Christianity?", options: ["Earned favor", "Unmerited favor", "Religious duty", "Holy law"], a: 1 },
  { q: "What is the church called in the New Testament?", options: ["The Bride of Christ", "The Holy Nation", "The Light of the World", "All of the above"], a: 3 },
];

export function openMinigame() {
  const selected = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 5);
  const TIME_PER_Q = 15;            // seconds
  let current = 0, score = 0;
  let rafId = null;                 // active requestAnimationFrame id
  let questionStart = 0;            // performance.now() when current question began
  let aborted = false;              // set true once the modal is closed

  function stopTimer() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tickTimer() {
    if (aborted) return;
    const fill = document.getElementById("tq-fill");
    if (!fill) return;              // DOM gone — bail without rescheduling
    const elapsed = (performance.now() - questionStart) / 1000;
    const remaining = Math.max(0, TIME_PER_Q - elapsed);
    // Direct width assignment every animation frame — no CSS transition,
    // so there's no lag/stutter and no float drift across ticks.
    fill.style.width = (remaining / TIME_PER_Q * 100) + "%";
    if (remaining <= 0) { stopTimer(); answer(-1); return; }
    rafId = requestAnimationFrame(tickTimer);
  }

  function renderQ() {
    const q = selected[current];
    const pad = isMobile ? "16px" : "12px";
    document.getElementById("minigame-content").innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:12px;">
        📖 Bible Trivia (${current + 1}/5)</h2>
      <div id="tq-timer" style="height:8px;background:#333;border-radius:4px;margin-bottom:14px;overflow:hidden;">
        <div id="tq-fill" style="height:100%;background:#FFD700;border-radius:4px;width:100%;"></div></div>
      <p style="font-size:17px;margin-bottom:18px;line-height:1.4;">${q.q}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${q.options.map((opt, i) => `
          <button data-tq-idx="${i}"
            style="padding:${pad};background:#2E0854;color:#fff;border:2px solid #7C3AED;
            border-radius:8px;font-size:15px;cursor:pointer;font-family:'Nunito',sans-serif;
            -webkit-tap-highlight-color:transparent;">${opt}</button>`).join("")}
      </div>
      <p style="margin-top:14px;color:#888;font-size:13px;">Score: ${score}/${current}</p>`;

    document.querySelectorAll("[data-tq-idx]").forEach(btn => {
      btn.addEventListener("click", () => answer(parseInt(btn.dataset.tqIdx)));
    });

    // Reset timer for the new question and start the rAF loop.
    stopTimer();
    questionStart = performance.now();
    rafId = requestAnimationFrame(tickTimer);
  }

  function answer(idx) {
    if (aborted) return;
    stopTimer();
    if (idx === selected[current].a) score++;
    if (++current >= selected.length) {
      const xp = score * 20;
      addXP(xp); if (score >= 4) addMember(1);
      document.getElementById("minigame-content").innerHTML = `
        <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">Quiz Complete!</h2>
        <p style="font-size:56px;margin:16px 0;">${score}/5</p>
        <p style="color:#ccc;">+${xp} XP${score >= 4 ? " · +1 Member!" : ""}</p>
        <button id="tq-back"
          style="margin-top:18px;padding:12px 24px;background:#7C3AED;color:#fff;border:none;
          border-radius:8px;font-size:16px;cursor:pointer;">Back to Church</button>`;
      document.getElementById("tq-back").addEventListener("click", () => {
        document.getElementById("minigame-modal").style.display = "none";
      });
      if (score >= 4) showToast("🎉 +1 Member!");
    } else renderQ();
  }

  openMinigameModal("");
  renderQ();

  // If the player closes the modal mid-question, abort the timer so it
  // doesn't keep ticking (and doesn't auto-advance into a hidden modal).
  const modal = document.getElementById("minigame-modal");
  const closeBtn = document.getElementById("minigame-close");
  function onAbort() {
    aborted = true;
    stopTimer();
    closeBtn?.removeEventListener("click", onAbort);
  }
  closeBtn?.addEventListener("click", onAbort);
  // Also pause the timer cleanly if the tab is backgrounded so the bar
  // doesn't appear to "jump" when the player returns — restart from the
  // current remaining time on visibility return.
  let hiddenAt = 0;
  function onVis() {
    if (aborted) return;
    if (document.hidden) {
      hiddenAt = performance.now();
      stopTimer();
    } else if (hiddenAt) {
      // Shift the question start forward by the time we were hidden so
      // the elapsed math resumes from where it left off.
      questionStart += performance.now() - hiddenAt;
      hiddenAt = 0;
      rafId = requestAnimationFrame(tickTimer);
    }
  }
  document.addEventListener("visibilitychange", onVis);
  // Clean up the visibility listener once the modal goes away.
  const cleanupObserver = new MutationObserver(() => {
    if (modal && modal.style.display === "none") {
      aborted = true;
      stopTimer();
      document.removeEventListener("visibilitychange", onVis);
      cleanupObserver.disconnect();
    }
  });
  if (modal) cleanupObserver.observe(modal, { attributes: true, attributeFilter: ["style"] });
}

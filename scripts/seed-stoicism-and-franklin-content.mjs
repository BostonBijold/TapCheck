// One-off content seed — NOT wired into app boot. Run manually:
//
//   node --env-file=.env.local scripts/seed-stoicism-and-franklin-content.mjs
//
// Two things, sourced from docs/franklins_13_virtues.md and
// docs/stoic_four_cardinal_virtues.md:
//   1. Updates the existing "franklin-13" Philosophy's 13 virtues in place
//      (tagline <- Franklin's own precept, essay <- the detailed description).
//      Requires scripts/migrate-philosophies.mjs to have already run once
//      (that's what creates the franklin-13 philosophy/virtues in the first
//      place) — errors out clearly if it can't find them.
//   2. Creates a new "Stoicism" Philosophy with its 4 cardinal virtues
//      (Wisdom, Courage, Justice, Temperance), if it doesn't already exist.
//
// Idempotent via upsert-by-slug — safe to re-run after editing the source
// docs above; re-running will overwrite any admin-dashboard edits made to
// these specific virtues/philosophies in the meantime, so don't re-run after
// hand-editing this content in the Manage sheet unless you mean to discard
// those edits.

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/seed-stoicism-and-franklin-content.mjs");
  process.exit(1);
}

// ── Franklin's 13 — updated content, keyed by the slug the original seed
// script already assigned (slugify(name), all single lowercase words) ──────
const FRANKLIN_UPDATES = [
  {
    slug: "temperance",
    name: "Temperance",
    tagline: "Eat not to dullness; drink not to elevation.",
    essay: "Temperance heads the list because Franklin saw it as the foundation the other twelve depend on — a mind fogged by overeating or drink cannot exercise the self-command the rest of the list requires. The precept isn't a call to total abstinence; it targets the specific failure points of dullness (the sluggish, stupid feeling of having eaten too much) and elevation (the loosened judgment of having drunk too much). Franklin's own habits bear this out: he was famously moderate in food and drink for his era, at one point living on little more than bread, water, and a few biscuits while a young printer in London, partly to save money and partly because he found he thought more clearly on a light diet. For him, temperance was less about virtue for its own sake than about protecting the clear-headedness every other discipline on the list depends on — you cannot practice Resolution, Order, or Industry with a mind dulled by excess.",
  },
  {
    slug: "silence",
    name: "Silence",
    tagline: "Speak not but what may benefit others or yourself; avoid trifling conversation.",
    essay: "Silence, for Franklin, was not about talking less in general but about talking with purpose — every utterance should either help the listener or help the speaker, and idle chatter should be avoided. He connected this virtue directly to his own ambition to learn: he noted that he adopted this precept partly because he'd come to believe that conversation dominated by talking rather than listening was a poor way to gain knowledge, and that a reputation for sound judgment was better built by asking good questions and listening well than by monopolizing a room with opinions. This is also where Franklin placed his famous shift away from blunt contradiction in argument — he had earlier been an aggressive, \"Socratic\" debater who loved catching people in contradictions, and came to see that style as making enemies without making progress. Silence, practiced this way, is as much intellectual humility as it is restraint of the tongue.",
  },
  {
    slug: "order",
    name: "Order",
    tagline: "Let all your things have their places; let each part of your business have its time.",
    essay: "Order asks for a fixed place for every possession and a fixed time for every task — the discipline of a planned day rather than a reactive one. Franklin included a sample daily schedule in the Autobiography built around this virtue: rising at five to wash, address \"Powerful Goodness,\" and plan the day's business; working through the morning and afternoon; evening given to putting things in their places, supper, relaxation, and self-examination via the question \"What good have I done today?\"; and sleep by ten. Notably, Franklin confessed Order was the virtue he struggled with most and never mastered — his natural memory for where things were, and his business's need to respond to whoever showed up whenever they showed up, kept working against the neat schedule he wanted. He kept it on the list anyway, and his honesty about failing at it is often cited as the most human moment in the whole project: the goal was progress, not a claim of perfection.",
  },
  {
    slug: "resolution",
    name: "Resolution",
    tagline: "Resolve to perform what you ought; perform without fail what you resolve.",
    essay: "Resolution is the virtue of follow-through — not merely deciding to do the right thing, but treating that decision as binding once made. Franklin frames it as a two-part discipline: first, resolve only to things you genuinely ought to do (so the commitment is sound), and second, once resolved, perform it without exception. This is the hinge virtue for everything that follows in the list, because Justice, Industry, and Frugality are all, in practice, promises to oneself that only mean something if kept. Franklin's own life supplies the clearest illustration: the entire thirteen-virtues project was itself an act of Resolution, and his account of tracking it daily for years — even while acknowledging he fell short — shows the virtue less as a single dramatic act of willpower and more as a habit of not letting a commitment quietly lapse once the initial enthusiasm faded.",
  },
  {
    slug: "frugality",
    name: "Frugality",
    tagline: "Make no expense but to do good to others or yourself; i.e., waste nothing.",
    essay: "Frugality is often shorthand for cheapness, but Franklin's precept is more precise: spend only where the money does good, to yourself or someone else, and waste nothing otherwise. This isn't hoarding — it's efficiency of resources, applied to time and materials as much as money. Franklin practiced this famously as a young printer, buying out his partners and living well below his means to build capital for his business, and he preached it publicly in Poor Richard's Almanack through maxims like \"A penny saved is a penny earned\" and \"Beware of little expenses; a small leak will sink a great ship.\" The precept ties directly to Industry (the next virtue): frugality without productive effort is just deprivation, but frugality paired with industrious effort was, for Franklin, the actual engine of the financial independence that let him retire from printing in his early forties and devote the rest of his life to science and public service.",
  },
  {
    slug: "industry",
    name: "Industry",
    tagline: "Lose no time; be always employed in something useful; cut off all unnecessary actions.",
    essay: "Industry is the demand that time itself be treated as a resource not to be squandered — every hour should go toward something useful, and actions that don't serve a purpose should be cut. Franklin was, by his own and his contemporaries' accounts, extraordinarily industrious: as a young tradesman he made a visible show of his own diligence, wheeling his own paper through the streets in a wheelbarrow rather than paying for delivery, specifically so his frugal, hardworking reputation would be seen and would earn him credit and customers. But Industry in his framework isn't only about paid work — self-education counted fully, and some of his most productive hours were spent teaching himself French, Italian, Spanish, and Latin, or reading and writing after the print shop closed. The virtue is less \"always be busy\" than \"never let time pass without it going somewhere\" — a distinction Franklin drew clearly when he warned against \"unnecessary actions,\" meaning motion or effort with no real end.",
  },
  {
    slug: "sincerity",
    name: "Sincerity",
    tagline: "Use no hurtful deceit; think innocently and justly, and, if you speak, speak accordingly.",
    essay: "Sincerity asks for alignment between thought and speech — think fairly and without malice, and if you do speak, let your words match that honest thinking. The qualifier \"hurtful\" is deliberate: Franklin isn't demanding a naive, say-everything bluntness (which would cut against Silence, above it on the list), but ruling out deceit used to damage or manipulate. This virtue is where Franklin's diplomatic reputation was built — in his later career as a negotiator and ambassador, particularly in securing French support during the American Revolution, his effectiveness rested on being trusted to mean what he said, even when he chose, per Silence, not to say everything he knew. Sincerity and Silence work as a pair in his system: one governs the content of speech (make it honest), the other governs its quantity (make it necessary).",
  },
  {
    slug: "justice",
    name: "Justice",
    tagline: "Wrong none by doing injuries or omitting the benefits that are your duty.",
    essay: "Franklin's Justice has two halves that are easy to miss if you only read the first: don't actively harm people, and — just as binding — don't withhold the good you owe them by duty. It's a virtue of active obligation, not merely of staying out of trouble. This is where Franklin's civic life shows most clearly: he treated public service — founding the Library Company of Philadelphia, the city's first volunteer fire department, the Pennsylvania Hospital, and the American Philosophical Society — not as optional generosity but as duties owed to a community he benefited from. The precept's second clause (\"omitting the benefits that are your duty\") is effectively a rejection of passive decency; a good man, in this framework, is accountable not only for the harm he causes but for the good he fails to do when it was his to give.",
  },
  {
    slug: "moderation",
    name: "Moderation",
    tagline: "Avoid extremes; forbear resenting injuries so much as you think they deserve.",
    essay: "Moderation extends temperance's logic from food and drink into emotional and social life: avoid extremes generally, and specifically, don't let resentment run to the full length you feel it's earned. The second clause is the sharper, more distinctive one — Franklin isn't asking for blind forgiveness, but for a deliberate discount on retaliation, holding back from the full measure of anger or payback that an injury might seem to justify. This reflects the same conflict-averse recalibration he describes making after his early years of combative, contradiction-hunting debate: he came to believe that even a \"just\" full-strength response to an injury usually cost more in goodwill and reputation than it gained. Moderation, in his system, is a practical brake on escalation as much as a personal disposition.",
  },
  {
    slug: "cleanliness",
    name: "Cleanliness",
    tagline: "Tolerate no uncleanliness in body, clothes, or habitation.",
    essay: "Cleanliness is the most literal virtue on the list — bodily hygiene, clean clothing, and a kept living space — but Franklin gave it standing alongside abstract virtues like Sincerity and Justice deliberately. In eighteenth-century terms, physical cleanliness was tied to health (long before germ theory, cleanliness was widely and correctly associated with avoiding disease) and to self-respect and social standing. There's also a quieter logic connecting it to Order: both virtues are about maintaining external conditions so that internal effort isn't wasted managing chaos or illness. A man whose body, clothes, and home are neglected has less capacity, practically and psychologically, to sustain the harder inward virtues on the rest of the list.",
  },
  {
    slug: "tranquility",
    name: "Tranquillity",
    tagline: "Be not disturbed at trifles, or at accidents common or unavoidable.",
    essay: "Tranquillity is composure under the ordinary friction of life — the refusal to be knocked off balance by small annoyances or by misfortunes that are either minor or genuinely outside anyone's control. Franklin explicitly separated the controllable from the uncontrollable here: things that are \"common or unavoidable\" don't deserve the same emotional response as things a person could actually have prevented. This is one of the more Stoic entries on Franklin's list (he read Cato and the Stoics as a young man and it shows), and it functions as an emotional-regulation counterpart to Moderation — where Moderation governs the response to injuries done by other people, Tranquillity governs the response to bad luck and small irritations that no one did on purpose.",
  },
  {
    slug: "chastity",
    name: "Chastity",
    tagline: "Rarely use venery but for health or offspring; never to dullness, weakness, or the injury of your own or another's peace or reputation.",
    essay: "Chastity, in Franklin's precept, is not a demand for celibacy but a call for restraint and responsibility around sexual conduct — reserving it chiefly for health or procreation, and never in a way that dulls the mind, weakens the body, or damages one's own or another person's peace and reputation. This is a notably practical, consequence-focused framing rather than a purely moral prohibition: the standard is harm (to self, to another's standing, to a relationship's peace), not the act itself in the abstract. It's also, by Franklin's own later admission, the virtue he found hardest to fully live up to — his youth included well-documented lapses, including an illegitimate son, William, whom he nonetheless raised and loved. The virtue's placement near the end of the list, just before Humility, is fitting: it's one where Franklin's own reach visibly exceeded his grasp.",
  },
  {
    slug: "humility",
    name: "Humility",
    tagline: "Imitate Jesus and Socrates.",
    essay: "Humility was not on Franklin's original list — he added it after a Quaker friend told him frankly that he was generally regarded as proud, and that his pride showed itself often in conversation, overbearing and rather insolent even when he thought he was being reasonable. Franklin's response was characteristically self-aware: he added the virtue, but also confessed in the Autobiography that he made little real progress against it, and that even if he had fully conquered pride, he'd probably end up proud of his own humility — \"For even if I could conceive that I had completely overcome it, I should probably be proud of my humility.\" The two examples he chose are pointedly different registers of the same quality: Jesus as the religious model of self-emptying humility, Socrates as the philosophical model of humility expressed through feigned ignorance and patient questioning rather than assertion. Franklin placed it last deliberately, as the virtue underneath all the others — the one that keeps the entire project of self-improvement from curdling into self-satisfaction.",
  },
];

// ── Stoicism — new philosophy, 4 cardinal virtues ──────────────────────────
const STOIC_VIRTUES = [
  {
    slug: "wisdom-stoic",
    name: "Wisdom",
    displayName: "Wisdom",
    tagline: "The knowledge of what is truly good, truly bad, and genuinely indifferent — and the practical skill of acting rightly in each situation life presents.",
    etymology: "Greek: Phronêsis / Sophia — practical and theoretical wisdom.",
    essay: "Wisdom is the Stoics' term for both theoretical understanding and practical judgment — knowing, in the abstract, that virtue is the only good and vice the only evil, and knowing, in the concrete moment, what the wise action actually is here, now, with this person, in this circumstance. Diogenes Laërtius defines it as \"knowledge of things good and evil and of what is neither good nor evil,\" and Chrysippus divided it further into good counsel (euboulia — the capacity to deliberate well before acting) and understanding (sunesis — the capacity to grasp a situation correctly). In practice, Epictetus reduced this to a single move that shows up constantly in Stoic writing: sorting the things that are \"up to us\" (our judgments, intentions, and choices) from the things that are not (other people, our bodies, our reputations, external events), and directing effort only at the former. Wisdom is often described as the \"parent\" virtue of the other three, since courage, justice, and temperance are really wisdom applied to specific domains — courage is wisdom about what to fear and endure, justice is wisdom about what's owed to others, temperance is wisdom about what to pursue and avoid in matters of pleasure and desire.",
  },
  {
    slug: "courage-stoic",
    name: "Courage",
    displayName: "Courage",
    tagline: "Steadiness of soul in the face of fear, pain, or hardship — doing what's right regardless of the cost to comfort or safety.",
    etymology: "Greek: Andreia.",
    essay: "Diogenes Laërtius defines courage as \"the state of the soul which is unmoved by fear,\" and the standard subdivisions — constancy or determination (aparallaxia) and tension or vigor (eutonia) — capture both halves of what the Stoics meant by it: the steady refusal to be shaken off course, and the active strength to keep pushing even when it's hard. Stoic courage is explicitly not recklessness or a mere absence of fear; Epictetus's formula \"persist and resist\" is often quoted because it captures the two-sided discipline involved — persisting in what's right despite difficulty, and resisting the pull of what's easy or pleasurable but wrong. It also covers more ground than physical bravery in battle, which is where the Greek word most naturally started: endurance of pain, illness, grief, and poverty are all courage, as is the moral courage to say an unpopular true thing or hold a principled position at personal cost. Roman Stoic history supplies its own examples of this — Cicero writing that magnanimity and constancy under pressure are the visible signs of courage, and later Stoics like Thrasea Paetus paying with their lives for refusing to flatter tyranny.",
  },
  {
    slug: "justice-stoic",
    name: "Justice",
    displayName: "Justice",
    tagline: "Giving each person what they are actually owed, and acting for the common good rather than narrow self-interest.",
    etymology: "Greek: Dikaiosynê.",
    essay: "Diogenes Laërtius defines justice as \"the state that distributes to each person according to what is deserved,\" with its main subdivisions being impartiality (isotês) and kindness or fair-mindedness (eugnômosunê) — fairness in judgment, and goodwill in dealing with others. Marcus Aurelius went further and called justice \"the source of all the other virtues,\" because it's the virtue that turns private moral effort outward into a life actually lived among other people. The philosophical engine behind Stoic justice is the concept of sympatheia — the idea that all rational beings are bound together as parts of one interconnected whole (Marcus Aurelius's image is a body made of many limbs), so that wronging another person is, in a real sense, wronging yourself and the whole community you belong to. This is also where Stoic justice extends past the merely legal or contractual: Cicero describes it as \"the bond of human society\" resting on good faith, truthfulness, and refusal to harm, and the Stoics folded piety — right conduct toward the divine or toward the natural order — into justice as well, alongside ordinary fairness between people.",
  },
  {
    slug: "temperance-stoic",
    name: "Temperance",
    displayName: "Temperance",
    tagline: "Rational self-control over desire and pleasure — moderation in what you pursue, and discipline in how you pursue it.",
    etymology: "Greek: Sôphrosynê.",
    essay: "Diogenes Laërtius defines temperance as \"moderation of the soul concerning the desires and pleasures... rational agreement within the soul about what is admirable and contemptible,\" with its main subdivisions being good discipline (eutaxia) and propriety or decorum (kosmiotês) — orderly self-governance, and a sense of what's fitting. Temperance is the Stoic virtue closest in spirit to Franklin's own opening virtue, but the Stoic version is broader than diet and drink: it covers the whole range of desire, from appetite and comfort to money, status, and sensory pleasure generally, and asks not for their elimination but for their rational governance. Marcus Aurelius's advice to \"do less, better\" and Epictetus's instruction to \"curb your desire — don't set your heart on so many things and you will get what you need\" both point at the same underlying claim: wanting less, and wanting it rationally rather than compulsively, is what actually produces contentment, where chasing every desire produces only more craving. Seneca ties this to a definition of wealth itself — that having enough, plus a margin, is truer riches than having more than you can rationally use — making temperance as much an economic and social discipline as a personal one.",
  },
];

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const philosophies = db.collection("philosophies");
  const virtues = db.collection("virtues");

  // ── 1. Update Franklin's 13 in place ─────────────────────────────────────
  const franklin = await philosophies.findOne({ slug: "franklin-13" });
  if (!franklin) {
    console.error('No "franklin-13" philosophy found — run scripts/migrate-philosophies.mjs first.');
    process.exit(1);
  }

  let franklinUpdated = 0;
  for (const v of FRANKLIN_UPDATES) {
    const res = await virtues.updateOne(
      { philosophyId: franklin._id, slug: v.slug },
      { $set: { name: v.name, displayName: v.name, tagline: v.tagline, essay: v.essay, updatedAt: new Date() } }
    );
    if (res.matchedCount === 0) {
      console.warn(`No existing Franklin virtue with slug "${v.slug}" — skipped (expected all 13 to already exist).`);
    } else {
      franklinUpdated++;
    }
  }
  console.log(`Updated ${franklinUpdated}/${FRANKLIN_UPDATES.length} Franklin virtues with your content.`);

  // ── 2. Create/update the Stoicism philosophy ─────────────────────────────
  const stoicDescription = "Four cardinal virtues — Wisdom, Courage, Justice, Temperance — the unified core of classical Stoic ethics, from Zeno to Marcus Aurelius.";
  let stoicism = await philosophies.findOne({ slug: "stoicism" });
  if (!stoicism) {
    const maxOrder = await philosophies.findOne({}, { sort: { order: -1 } });
    const res = await philosophies.insertOne({
      name: "Stoicism",
      slug: "stoicism",
      description: stoicDescription,
      isSystem: true,
      isActive: true,
      order: (maxOrder?.order ?? -1) + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    stoicism = { _id: res.insertedId };
    console.log("Created Stoicism philosophy:", stoicism._id.toString());
  } else {
    await philosophies.updateOne({ _id: stoicism._id }, { $set: { description: stoicDescription, updatedAt: new Date() } });
    console.log("Stoicism philosophy already exists:", stoicism._id.toString());
  }

  let stoicUpserted = 0;
  for (let i = 0; i < STOIC_VIRTUES.length; i++) {
    const v = STOIC_VIRTUES[i];
    await virtues.updateOne(
      { slug: v.slug },
      {
        $set: {
          philosophyId: stoicism._id,
          name: v.name,
          displayName: v.displayName,
          tagline: v.tagline,
          etymology: v.etymology,
          essay: v.essay,
          order: i + 1,
          isActive: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    stoicUpserted++;
  }
  console.log(`Upserted ${stoicUpserted} Stoic virtues.`);

  await client.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

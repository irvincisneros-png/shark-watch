// All player-facing facts and prompts. Fact cards are short (25 words or fewer) and neutral in tone.
export const FACTS = {
  tag: { title: 'Acoustic tag', icon: 'tag', text: 'Scientists clip a small acoustic tag to the shark. It sends out a unique ID code that listening stations can record.' },
  ping: { title: 'A ping is a data point', icon: 'ping', text: 'Each ping is one row of data: tag ID, station and time. Scientists use many pings to work out where a shark went.' },
  gap: { title: 'Gaps in the data', icon: 'gap', text: 'Miss a station and there is no row of data for it. Scientists then have to guess where the shark went.' },
  ventilate: { title: 'Keep moving', icon: 'gill', text: 'White sharks must keep swimming. Moving water flows over their gills so they can breathe. This is called ram ventilation.' },
  salmon: { title: 'Australian salmon', icon: 'fish', text: 'Young white sharks mostly eat fish and rays. Australian salmon schools along the NSW coast are a common meal.' },
  tailor: { title: 'Tailor', icon: 'fish', text: 'Tailor are fast schooling fish. They are harder to catch than salmon, but give a bigger energy boost.' },
  ray: { title: 'Hidden stingray', icon: 'ray', text: 'Stingrays bury themselves in sand. Young white sharks eat rays, and can sense them even when hidden.' },
  person: { title: 'People are not prey', icon: 'person', text: 'Sharks do not hunt people. Bites are very rare, and swimmers and surfers are not on a white shark’s menu.' },
  eac: { title: 'East Australian Current', icon: 'eac', text: 'The East Australian Current carries warm water south along the NSW coast. Animals can ride it to save energy.' },
  electro: { title: 'Electro-sense', icon: 'electro', text: 'Sharks sense the tiny electric fields of living animals using jelly-filled pores called ampullae of Lorenzini.' },
  bait: { title: 'Bait ball', icon: 'bait', text: 'When threatened, small fish pack into a tight bait ball. Sharks, dolphins and seabirds all feed on them.' },
  scent: { title: 'Sense of smell', icon: 'scent', text: 'Sharks have an excellent sense of smell and can detect prey scents at very low concentrations in the water.' },
  battery: { title: 'Tag battery', icon: 'battery', text: 'Acoustic tags can last for years, but their batteries do run out. After that, the shark stops pinging stations.' },
  line: { title: 'Fishing line', icon: 'line', text: 'Discarded fishing line and hooks can tangle sharks and other marine animals, causing injuries and making swimming harder.' },
  plastic: { title: 'Marine debris', icon: 'plastic', text: 'Floating plastic bags can look like squid or jellyfish. Animals that eat plastic get no nutrition and can be harmed.' },
  net: { title: 'Shark nets', icon: 'net', text: 'NSW shark-meshing nets protect some beaches between Newcastle and Wollongong. They also catch non-target animals such as turtles, rays and dolphins.' },
  drumline: { title: 'SMART drumline', icon: 'drumline', text: 'SMART drumlines alert fisheries staff when an animal is hooked. Target sharks are tagged, then released further offshore.' },
  ship: { title: 'Shipping lane', icon: 'ship', text: 'Port Kembla is a busy port. Ship propellers churn up strong, turbulent water that can injure animals nearby.' },
};

export const LINES = {
  person: 'Sharks do not hunt people. Bites are very rare.',
  bottom: 'Out of energy. You rest on the seabed, then try again from the last station.',
  faint: 'Out of oxygen. White sharks have to keep swimming to breathe. Try again from the last station.',
};

export const INTRO_CAPTIONS = [
  'It is spring on the NSW coast. A young white shark has been caught safely by scientists.',
  'They clip an acoustic tag to its dorsal fin. Each tag sends out a unique ID.',
  'Tagged! Now swim south from Bondi to Kiama. Get detected at each listening station.',
];

export const REFLECTION = [
  { key: 'Systems', q: 'Where would you add another listening station so there are fewer gaps in the data? Why there?' },
  { key: 'Statistics', q: 'Is one tagged shark enough to say that all white sharks do this? Why not? What data would you need?' },
  { key: 'Science', q: 'Imagine you had 10 years of pings from many sharks. What hypothesis could you test with that data?' },
];

export const TEACHER_QUESTIONS = [
  'Your run produced a dataset of pings. What does a ping tell scientists, and what does it NOT tell them?',
  'The real shark skipped some stations. Does that mean it was not near them? How could a data scientist decide?',
  'Which parts of this activity were statistics, algorithms/systems, scientific method, and interdisciplinary knowledge (biology, geography, tech)?',
];

export const HINTS = {
  desktop: 'Up/Down or W/S to steer · hold Space or Shift to boost · E for Electro-sense · P to pause',
  touch: 'Drag on the left to steer · BOOST and SENSE buttons on the right',
};

export const CREDITS = {
  imos: 'Data was sourced from Australia’s Integrated Marine Observing System (IMOS) Animal Tracking Database (https://animaltracking.aodn.org.au). IMOS is enabled by the National Collaborative Research Infrastructure Strategy (NCRIS).',
  receiver: 'NSW DPI (Whaler, White and Tiger Shark Program)',
};

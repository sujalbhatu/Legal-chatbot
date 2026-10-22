// Content shared by the landing page, dashboard and chat: example questions by
// topic, answer languages, and the product facts quoted on the landing page.
// Facts here must stay true: they come from docs/WEEK3_RESULTS.md.

export const TOPICS = [
    {
        key: 'crime', label: 'Crime & police', icon: 'Shield',
        questions: [
            'Someone stole my bike. What offence is this under the BNS?',
            'The police refused to register my FIR. What can I do?',
            'What are my rights if I am arrested?',
        ],
    },
    {
        key: 'family', label: 'Marriage & family', icon: 'Heart',
        questions: [
            'How does divorce by mutual consent work?',
            'My husband and in-laws harass me for dowry. What can I do?',
            'Can my wife claim maintenance after we separate?',
        ],
    },
    {
        key: 'property', label: 'Property & tenancy', icon: 'Home',
        questions: [
            'My tenant refuses to leave after the lease ended.',
            'What is needed to gift a house to my daughter?',
            'A builder took my advance but will not execute the sale deed.',
        ],
    },
    {
        key: 'cyber', label: 'Cyber & online fraud', icon: 'Smartphone',
        questions: [
            'Someone made a fake Instagram account with my photos.',
            'Someone hacked my email and deleted my files.',
            'Can WhatsApp chats be used as evidence in court?',
        ],
    },
    {
        key: 'rights', label: 'Rights & government', icon: 'Landmark',
        questions: [
            'How do I file an RTI application?',
            'What does Article 21 of the Constitution protect?',
            'Can the government make Aadhaar compulsory for a subsidy?',
        ],
    },
    {
        key: 'business', label: 'Work, tax & contracts', icon: 'Briefcase',
        questions: [
            'Who has to register under GST?',
            'Is a non-compete clause in my job contract valid?',
            'Can a minor sign a valid contract in India?',
        ],
    },
];

export const LANGUAGES = [
    ['auto', 'Auto-detect'], ['en', 'English'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['mr', 'मराठी'],
    ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['gu', 'ગુજરાતી'], ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം'],
    ['pa', 'ਪੰਜਾਬੀ'], ['or', 'ଓଡ଼ିଆ'], ['as', 'অসমীয়া'], ['sat', 'ᱥᱟᱱᱛᱟᱲᱤ'], ['ur', 'اردو'],
];

// Greetings in the languages shown on the landing page
export const LANGUAGE_SAMPLES = [
    'English', 'हिन्दी', 'বাংলা', 'मराठी', 'தமிழ்', 'తెలుగు', 'ગુજરાતી',
    'ಕನ್ನಡ', 'മലയാളം', 'ਪੰਜਾਬੀ', 'ଓଡ଼ିଆ', 'অসমীয়া', 'ᱥᱟᱱᱛᱟᱲᱤ', 'اردو',
];

export const STATS = [
    { value: '123', label: 'Central Acts indexed' },
    { value: '14', label: 'Indian languages' },
    { value: '< 2.5 s', label: 'to the first words' },
    { value: '100%', label: 'answers with clickable sources' },
];

export const FAQ = [
    {
        q: 'Is this legal advice?',
        a: 'No. OpenForge explains what Indian law says and shows you the exact sections it used, so you can understand your situation and ask better questions. For advice on your specific case, talk to a qualified lawyer.',
    },
    {
        q: 'Where do the answers come from?',
        a: 'Only from the text of Indian Acts in our library: the Constitution, the new criminal codes (BNS, BNSS, BSA), civil, family, property, cyber, tax and many more. Every answer lists the sections it read, and you can open each one.',
    },
    {
        q: 'What if my question is not covered?',
        a: 'It tells you it could not find it in the Acts it has, instead of guessing. You can rephrase, or ask about a related law.',
    },
    {
        q: 'Do I need an account?',
        a: 'No. Guest mode lets you ask a few questions without signing up. With a free account your conversations are saved, you can continue them later, and you get more questions.',
    },
    {
        q: 'Which languages can I use?',
        a: 'English and 13 Indian languages, including Hindi, Bengali, Marathi, Tamil, Telugu, Odia, Assamese and Santali. Write in your language, or pick the answer language yourself.',
    },
    {
        q: 'Is my data private?',
        a: 'Passwords are hashed, accounts are verified by email, and each conversation is visible only to you. Guest questions are not stored on our servers.',
    },
];

// Key Acts in the index, for the dashboard's "Browse by Act" cards (all of these are searchable).
// `area` sets the card's colour, so Acts of the same kind look alike.
export const LIBRARY = [
    { short: 'BNS', name: 'Bharatiya Nyaya Sanhita, 2023', area: 'criminal', scope: 'Offences and punishments. Replaced the IPC.' },
    { short: 'BNSS', name: 'Bharatiya Nagarik Suraksha Sanhita, 2023', area: 'criminal', scope: 'FIR, arrest, bail and trial. Replaced the CrPC.' },
    { short: 'BSA', name: 'Bharatiya Sakshya Adhiniyam, 2023', area: 'criminal', scope: 'Evidence, including WhatsApp and other electronic records.' },
    { short: 'COI', name: 'Constitution of India', area: 'rights', scope: 'Fundamental rights, writs and duties.' },
    { short: 'RTI', name: 'Right to Information Act, 2005', area: 'rights', scope: 'Getting information from government offices.' },
    { short: 'ICA', name: 'Indian Contract Act, 1872', area: 'civil', scope: 'Agreements, breach and compensation.' },
    { short: 'TPA', name: 'Transfer of Property Act, 1882', area: 'civil', scope: 'Sale, lease, gift and mortgage of property.' },
    { short: 'ITA', name: 'Information Technology Act, 2000', area: 'tech', scope: 'Hacking, identity theft and online fraud.' },
];

export const LAW_AREAS = {
    criminal: 'Criminal law',
    rights: 'Rights & government',
    civil: 'Civil & property',
    tech: 'Cyber law',
};

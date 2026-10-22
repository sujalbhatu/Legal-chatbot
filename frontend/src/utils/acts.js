// Short labels and areas of law for Act names, for chips like "BNS §319".

const ACTS = [
    [/nyaya sanhita/i, 'BNS', 'criminal'],
    [/nagarik suraksha/i, 'BNSS', 'criminal'],
    [/sakshya/i, 'BSA', 'criminal'],
    [/sexual offences|pocso/i, 'POCSO', 'criminal'],
    [/narcotic/i, 'NDPS', 'criminal'],
    [/constitution/i, 'Constitution', 'rights'],
    [/right to information/i, 'RTI Act', 'rights'],
    [/aadhaar/i, 'Aadhaar Act', 'rights'],
    [/information technology/i, 'IT Act', 'tech'],
    [/contract act/i, 'Contract Act', 'civil'],
    [/transfer of property/i, 'TPA', 'civil'],
    [/specific relief/i, 'Specific Relief', 'civil'],
    [/civil procedure/i, 'CPC', 'civil'],
    [/hindu marriage/i, 'HMA', 'civil'],
    [/special marriage/i, 'SMA', 'civil'],
    [/domestic violence|protection of women/i, 'DV Act', 'civil'],
    [/goods and services/i, 'CGST', 'civil'],
    [/motor vehicles/i, 'MV Act', 'civil'],
];

export function actInfo(name = '') {
    for (const [rx, short, area] of ACTS) {
        if (rx.test(name)) return { short, area };
    }
    const short = name.replace(/^the\s+/i, '').replace(/,?\s*\d{4}$/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    return { short: short.length > 22 ? `${short.slice(0, 20)}…` : short, area: 'other' };
}

/** "BNS §319", "Constitution Art. 21" */
export function citationLabel({ act, section }) {
    const { short } = actInfo(act);
    if (!section) return short;
    return /constitution/i.test(act) ? `${short} Art. ${section}` : `${short} §${section}`;
}

/** Unique cited sections of one conversation, in order. */
export function uniqueCitations(citations = []) {
    const seen = new Set();
    return citations.filter(c => {
        const key = `${c.act}|${c.section}`;
        if (!c.act || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

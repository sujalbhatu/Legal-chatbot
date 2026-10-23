# Memory benchmark - Cyber impersonation and UPI fraud - 20-turn consultation

2026-10-21, 20 turns, answer model openai/gpt-oss-120b, summarizer openai/gpt-oss-120b.

| Strategy | Answer-prompt tokens, 20 turns | + summarization | Net | vs full | Last-turn answer prompt | Turn-1 facts at turn 20 |
|---|---:|---:|---:|---:|---:|---|
| full history | 82,678 | 0 | 82,678 | 0.0% fewer | 7,012 | PASS {'Rahul': True, '18,?000': True} |
| window (last 6) | 42,429 | 0 | 42,429 | 48.7% fewer | 1,693 | FAIL {'Rahul': False, '18,?000': False} |
| summary (last 4 + recursive summary) | 49,664 | 8,446 | 58,110 | 29.7% fewer | 2,167 | PASS {'Rahul': True, '18,?000': True} |

Full and window totals are tokenizer counts (o200k_harmony) of the prompts those strategies would send on the same transcript with the same retrieved sources, scaled by the median Groq/tokenizer ratio measured on the summary prompts (1.032, range [1.021, 1.108]). Last-turn prompts are Groq-reported from real calls.

## Final answers (turn 20)

> Before I go, summarise my case for me: who lost how much money, which sections you said apply, and the first step I should take.

### summary

**Short answer**  
Your friend Rahul lost ₹18,000 to a fake Instagram profile that impersonated you. The likely offences are cheating by personation (Section 319 of the Bharatiya Nyaya Sanhita) and cyber‑fraud/cheating by personation using a computer (Section 66D of the Information Technology Act). The first step is to go to the nearest police station and lodge a written complaint/FIR, attaching all electronic evidence.

**What the law says**  
- **Section 319, Bharatiya Nyaya Sanhita** – cheating by personation (punishment up to three years imprisonment and/or fine)【1】.  
- **Section 66D, Information Technology Act, 2000** – cheating by personation using a computer or communication device (punishment up to three years imprisonment and/or fine)【2】.  
- **Section 173(4), Bharatiya Nagarik Suraksha Sanhita** – if the police‑station officer refuses to record the information, you may send the substance in writing to the Superintendent of Police, who can order an investigation【5】.  
- **Section 514, Bharatiya Nagarik Suraksha Sanhita** – limitation periods (generally three years for offences punishable with imprisonment up to three years)【2】.  

**What you can do next**  
1. **Gather evidence** – screenshots of the fake Instagram profile, chat logs, UPI transaction receipt, device metadata. Keep originals intact and make backup copies.  
2. **Visit the local police station** and file a written complaint/FIR, citing Sections 319 B.N.S. and 66D IT Act, and attach the evidence.  
3. **Obtain a copy of the FIR/complaint receipt** with date‑stamp; this starts the limitation clock.  
4. If the officer **refuses to record** the complaint, send the same information by registered post to the **Superintendent of Police** under Section 173(4) and keep the receipt.  

*This is general information, not legal advice.*

### full

**Case summary**

- **Loss:** Your friend **Rahul** was deceived and transferred **₹18,000** to a fake Instagram profile that used your photos.  
- **Applicable sections:**  
  1. **Section 66D of the Information Technology Act, 2000** – “Punishment for cheating by personation by using computer resource” (up to 3 years imprisonment and fine up to ₹1  lakh).  
  2. **Section 319 of the Bharatiya Nyaya Sanhita, 2023** – “Cheating by personation” (up to 5 years imprisonment, fine or both).  
  3. **Section 61 of the Bharatiya Sakshya Adhiniyam, 2023** – electronic records (screenshots, chat logs, UPI receipt) are admissible as evidence.  
- **First step:** Go to the **nearest police station** and lodge a written complaint/FIR, attaching all electronic evidence (Instagram screenshots, chat logs, UPI transaction receipt) and specifically citing Sections 66D (IT Act) and 319 (Bharatiya Nyaya Sanhita).  

*This is general information, not legal advice.*

### window

**Summary of your case**

- **Loss:** You were defrauded of **₹ [amount you mentioned]** (the exact figure you gave) by a person who used a fake identity to obtain money from you through a digital transaction.  
- **Applicable provisions:**  
  * **Section 319 of the Bharatiya Nagarik Suraksha Sanhita (B.N.S.)** – offence of cheating by personation.  
  * **Section 514 of the B.N.S.** – sets the limitation period for filing the complaint (six months, one year or three years depending on the maximum punishment).  
  * **Section 173(4) of the B.N.S.** – if the police‑station officer refuses to record your complaint, you may send the information in writing to the Superintendent of Police.  
  * **Section 188 of the B.N.S.** – any investigation by a subordinate officer must be reported to the officer in charge of the police station.  
  * **Section 224 of the B.N.S.** – a complaint presented to an inappropriate magistrate must be returned, confirming that the police station is the proper first forum.  

**First step you should take**

1. **Go to the nearest police station** and file a written complaint/FIR, attaching all evidence (screenshots, transaction details, communication with the fraudster). Obtain a dated, stamped copy of the FIR/complaint receipt.  

*This is general information, not legal advice.*

## Long-term summary after 20 turns

- Fake Instagram profile used your photos, impersonated you, messaged friend Rahul who transferred Rs 18,000 via UPI to the impostor.  
- Offences: IT Act 2000 Sec 66D (cheating by personation using a computer); Bharatiya Nyaya Sanhita 2023 Sec 319 (cheating by personation); ordinary cheating Sec 318(2). Personation carries higher maximum penalty.  
- FIR can be lodged by you or Rahul; if police refuse, send written complaint to SP under BNS Sec 173(4) or approach Magistrate. Investigation must be completed within 2 months for listed offences (BNS Sec 193(2)).  
- Evidence to preserve: full screenshots of the Instagram profile (picture, bio, posts, messages requesting money) with visible date‑time stamps; export chat logs as PDF/text preserving timestamps; UPI transaction receipt (screen capture and PDF/statement showing amount, date, time, VPA); device metadata (IP, device ID, OS version); keep original files intact and back‑up on secure external drive/cloud.  
- Admissibility: Section 61 Bharatiya Sakshya Adhiniyam gives electronic records same legal effect; Section 58(2)(d) requires the actual copy, not oral description. Screenshots are admissible without a certificate unless used as a “statement”; then a certificate per Section 63 (identifying record, device, signed by custodian/expert) is needed. Certified copies or expert affidavit strengthen authenticity.  
- If the impostor is a minor (<18 yr), case falls under Juvenile Justice Act 2015 Sec 14 – trial in Juvenile Justice Board, max 3 yr imprisonment/fine, rehabilitative measures; evidence rules unchanged but testimony must follow juvenile safeguards.  
- Civil recovery: Rahul can sue for Rs 18,000 under Indian Contract Act (fraud makes contract voidable) and Specific Relief Act/CPC.  
- Next steps: file FIR (mention possible minor), obtain FIR copy, request investigation timeline, preserve and certify evidence, engage lawyer for criminal and civil aspects.
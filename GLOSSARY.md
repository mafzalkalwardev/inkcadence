# Inkcadence

Inkcadence learns one person's own handwriting from photos of their writing and writes new text, which they supply, in that hand.

## The hand

**Hand**:
Everything Inkcadence knows about one person's handwriting: their pens, glyphs and style.
_Avoid_: style pack (the stored file of a hand), font, model, profile

**Pen**:
One writing instrument as it appears in the samples, defined by ink colour, stroke width and kind (pen, marker, pencil), with a role of body or heading.
_Avoid_: ink, colour, palette

**Glyph**:
One image of one character as the person wrote it.
_Avoid_: crop (a glyph before it is labelled), letterform, cell

**Variant**:
One of several glyphs a hand holds for the same character.

**Source**:
Where a glyph came from: `sheet`, `page`, or `generated`.

**Generated glyph**:
A glyph Inkcadence made in the person's style for a character their samples did not contain.
_Avoid_: fallback, synthetic letter

**Personal examples**:
The glyphs the person has confirmed, used to recognise their writing more accurately on later pages.

**Heading treatment**:
How the person writes headings: which pen, how much larger than body text, underline, case.

**Style stats**:
The measured habits of a hand: slant, x-height, letter and word spacing, line spacing, baseline wobble.

**Demo hand**:
A hand made from real, consented handwriting that visitors can use before making their own.

## Samples

**Letter sheet**:
A printable page of boxes, one character per box, that a person fills in by hand and photographs.
_Avoid_: glyph sheet, alphabet sheet, template

**Fill-in sheet**:
A letter sheet containing only the characters a hand is missing or the person wants to replace.

**Known lines**:
Short given sentences a person copies onto plain paper when they cannot print a letter sheet.

**Page**:
A photo of something the person wrote before, such as old notes or coursework, used to learn their pens, headings and style stats.
_Avoid_: assignment, sample (for a single photo)

**Show-through**:
Writing from the back of a page that is faintly visible in a photo of the front.

**Harvest**:
Finding and labelling glyphs on pages.

## Output

**Attestation**:
The person's confirmation that the handwriting they are teaching Inkcadence is their own.

**Disclosure**:
The "AI-assisted" note every export carries in its file metadata, and optionally as a visible footer.
_Avoid_: watermark

# Platform rules for a handwriting-assignment product

Research for [#3](https://github.com/mafzalkalwardev/inkcadence/issues/3). Checked 2026-11-12 against each provider's own policy pages. Quotes are verbatim from the linked page unless marked **[unverified]**. An item is marked unverified when the official page blocked automated fetching (PayPal returns HTTP 403; teqsa.gov.au timed out) and the wording comes only from search-engine excerpts. Nothing here is legal advice.

## Verdict

None of these providers bans software that renders the user's own text in the user's own handwriting. All of them ban, either by name or through "illegal" and "deceptive" catch-alls, services that do students' work for them or help people mislead others. Inkcadence is allowed only while it stays the first kind of product: it never writes the words, it learns only the user's own hand, and it isn't marketed for handing work in as handwritten.

| Provider | Allowed as a personal handwriting renderer? | Clause that matters most | Risk with today's "assignment" wording |
|---|---|---|---|
| **Stripe** | Yes. No academic clause. | Illegal "in the jurisdictions where your business is located or to which your business is targeted"; "Document falsification services"; "unfair, deceptive" catch-all | Medium. No named ban, but contract-cheating laws (UK, Australia) are pulled in by the illegality clause. |
| **Paddle** (merchant of record) | Yes, as software. | Prohibited: "Certifications and exam preparation services, including … essay and paper mills, ghostwriting services"; likeness-without-consent content generation | High. Its wording matches "exam", "essay" and ghostwriting. |
| **Lemon Squeezy** (merchant of record) | Yes, as software. | Prohibited: "Homework/Essay mills" | High. The word "homework" appears in its policy word for word. |
| **PayPal** | Yes. No academic clause in its main Acceptable Use Policy. | "violate any law"; "items that encourage, promote, facilitate or instruct others to engage in illegal activity" | Medium. **[unverified]** Search excerpts say PayPal's Alternative Payment Methods terms and Braintree policy name "essay mills" / "academic cheating products". |
| **Google Play** | Yes. | 3.1 "apps that help users to mislead others"; store listings must "precisely reflect the app's functionality"; AI-content reporting | Medium. Depends on the store listing. Phrases like "pass as handwritten" or "submit" would trip 3.1. |
| **Apple App Store** | Yes. | 1.1.6 false or trick functionality; 2.3 accurate metadata; 5 Legal; 1.2 safeguards for "AI content creation apps" | Medium. The same issue: it depends on the listing. |
| Google Ads (a marketing channel, not asked about) | Not if it's marketed as a cheating aid. | Bans "Services or products that enable academic dishonesty, like essay or thesis generators" | High if the ads mention assignments or exams. |

## Words and features that trigger restrictions

| Word or feature | Where it collides | Effect |
|---|---|---|
| **homework** | Lemon Squeezy "Homework/Essay mills" | Matches the ban word for word. |
| **essay, paper, thesis, ghostwriting** | Paddle "essay and paper mills, ghostwriting services"; Lemon Squeezy; Google Ads "essay or thesis generators" | Matches by name. Today's UI has a "blank essay" paper preset. |
| **exam** (including "exam lined", "neat exam") | Paddle's prohibited heading "Certifications and exam preparation services"; Google Ads bans imagery of "a student looking over their shoulder during an exam" | Matches by name. |
| **assignment(s)** for the output ("handwritten assignment generator", "Format assignment") | No provider uses the word. UK law defines the offence as "completing all or part of an assignment on behalf of a student" | Indirect, but it is what reviewers will map to an essay mill (inference). |
| **undetectable, "teacher won't know", "submit as your own", "passes as handwritten"** | Google Ads ("fool the system"); Play 3.1 ("help users to mislead others"); Stripe and Paddle "deceptive"; Apple 2.3.1(b) | Turns a tool into a deception aid. Banned everywhere. |
| **Writing the content** (LLM text generation) | Paddle ghostwriting; Google Ads "essay … generators"; Play's AI-generated content policy | Would put Inkcadence squarely in the banned category. |
| **Cloning someone else's handwriting** | Paddle "content generation using a person's likeness without that person's explicit consent"; PayPal "right of publicity"; Stripe "Document falsification services" | Prohibited or high risk. |
| **Signatures, IDs, certificates, diplomas** | Play 3.1 (IDs, diplomas); Stripe "Document falsification services"; Google Ads "fake or false documents like passports or diplomas" | Prohibited. The docs already disclaim this. |

## Payment providers

### Stripe

Source: [Prohibited and Restricted Businesses](https://stripe.com/legal/restricted-businesses) ("Last updated: 2026-09-22").

- There is no academic clause. The page contains none of the words "education", "academic", "school", "student", "essay", "plagiarism", "homework" or "cheat".
- Scope: "You must not use Stripe's services for any illegal activities or for the businesses or product types listed below. The types of businesses listed here are representative of prohibited categories, but this is not an exhaustive list."
- Under *Any illegal products and services*: "Any other products or services that are in violation of law in the jurisdictions where your business is located or to which your business is targeted". This pulls in the cheating-services laws below for any customers in England or Australia.
- Under *Unfair, deceptive, or abusive acts or practices*: "Document falsification services" and "Any other businesses that Stripe considers unfair, deceptive, or predatory towards consumers".
- Under intellectual property: "Any other products or services that directly infringe or facilitate infringement upon the trademark, patent, copyright, trade secrets, proprietary, or privacy rights of any third party".

**What keeps it compliant:** describe the product as a handwriting renderer for the user's own text and hand. Nothing in Stripe's text bars that.

### Paddle (merchant of record)

Source: [Understanding Paddle's Acceptable Use Policy](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle) ("Last Updated 13 April 2026").

- Fit: "Paddle is built to serve software companies (including B2B SaaS, Consumer Software, and Games)."
- Blanket restrictions on any offering that: "Violates any law or government regulation;" "Involves fraudulent, deceptive, unfair, abusive, or predatory practices;" "Threatens reputational damage to Paddle or any Card Brand Network;". Paddle also says it "reserves the right to exercise judgment in ascertaining whether any of these factors are likely to be present."
- Prohibited categories:
  - "**Certifications and exam preparation services**, including but not limited to: essay and paper mills, ghostwriting services"
  - "**Content generation**, including but not limited to: … Deep Fakes Images or Videos … Any content generation using a person's likeness without that person's explicit consent … Any content generation that falls into other prohibited categories"
- Paddle notes that "Many of these categories are imposed by Card Network rules or by our payment processors."

**What keeps it compliant:** don't use "exam", "essay" or "assignment" for the output. Make clear that the user supplies all the text, which rules out ghostwriting. Collect and store the user's consent that the handwriting is their own. Expect a manual review; the policy is judgement-based.

### Lemon Squeezy (merchant of record)

Sources: [Prohibited Products](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products) and [Terms, Appendix A](https://www.lemonsqueezy.com/terms).

- "The following products and services are prohibited on Lemon Squeezy: … **Homework/Essay mills** …" The Terms (Appendix A, "Prohibits Products/Services") repeat it: "Homework/Essay mills."
- Enforcement: "If you violate our terms of service or attempt to sell prohibited products, you risk getting your store placed in review or suspended without notice."
- Pre-clearance is offered: "If you are unsure whether your content is prohibited, please contact Lemon Squeezy support with a description or example of the content before you start selling."

**What keeps it compliant:** never use "homework" in the product name, listing, checkout or marketing. Ask Lemon Squeezy support to pre-clear the product with an accurate description before launch.

### PayPal

Source: PayPal Acceptable Use Policy, official PDF ([GB copy](https://www.paypalobjects.com/marketing/ua/pdf/GB/en/acceptableuse-full.pdf), "Last Update: 1 November 2023"). The live pages, including the [US policy](https://www.paypal.com/us/legalhub/paypal/acceptableuse-full), return HTTP 403 to automated fetches, so the current US text is **[unverified]**.

- "You may not use the PayPal service for activities that: 1. violate any law, statute, ordinance or regulation. 2. relate to transactions involving … (d) items that encourage, promote, facilitate or instruct others to engage in illegal activity, … (h) items that infringe or violate any copyright, trademark, right of publicity or privacy or any other proprietary right under the laws of any jurisdiction …"
- "4. involve the sales of products or services identified by government agencies to have a high likelihood of being fraudulent."
- The main policy has no academic clause.
- **[unverified]** Search excerpts of PayPal's [Alternative Payment Methods terms](https://www.paypal.com/us/legalhub/paypal/apm-tnc) and the [Braintree Acceptable Use Policy](https://www.paypal.com/us/legalhub/braintree/acceptable-use-policy) list "essay mills", "academic cheating products" and "homework services" as restricted. Both pages returned 403, so the exact wording and scope couldn't be confirmed.

**What keeps it compliant:** the same as Stripe, and avoid any wording that suggests the product facilitates breaking a cheating-services law.

### Laws pulled in by the "violates any law" clauses

- **England: [Skills and Post-16 Education Act 2022, s.26–28](https://www.legislation.gov.uk/ukpga/2022/21/section/26).**
  - s.26(2): "'Relevant service' means a service of completing all or part of an assignment on behalf of a student where the assignment completed in that way could not reasonably be considered to have been completed personally by the student."
  - [s.27(1)](https://www.legislation.gov.uk/ukpga/2022/21/section/27): "It is an offence for a person to provide, or arrange for another person to provide, in commercial circumstances, a relevant service for a student in relation to a relevant assignment." There is a defence where the defendant "did not know, and could not with reasonable diligence have known".
  - [s.28(1)](https://www.legislation.gov.uk/ukpga/2022/21/section/28): "A person who advertises a relevant service to students commits an offence."
  - Scope: post-16 students in England.
- **Australia: TEQSA Act 2011, s.114A–114B [unverified].** The [TEQSA site](https://www.teqsa.gov.au/preventing-contract-cheating/legislation) timed out. Search excerpts give the s.5 definition of "academic cheating service" as providing or undertaking work that "is, or forms a substantial part of, an assessment task that students are required to personally undertake". Providing and advertising such services carry civil and criminal penalties. TEQSA reports that Chegg was penalised under these provisions.
- Neither law has been tested on rendering a student's own words in their own hand. The exposure is highest where an institution requires the work to be handwritten personally. The clearest risk is **advertising** the product to students for that purpose (s.28).

## App stores

### Google Play

Sources: [Deceptive Behavior](https://support.google.com/googleplay/android-developer/answer/17006354?hl=en), [AI-Generated Content policy](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en) and its [explainer](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en), [Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

- General: "Google Play strictly prohibits all forms of deception. You and your app … must never mislead users or enable dishonest behaviors. All metadata, including the store listing, screenshots, and title, must precisely reflect the app's functionality."
- 3.1: "We don't allow apps that help users to mislead others or are functionally deceptive in any way, including, but not limited to: apps that generate or facilitate the generation of ID cards, social security numbers, passports, diplomas, credit cards, bank accounts, and driver's licenses."
- 3.3: "Any claim that an app is a 'prank', 'for entertainment purposes' (or other synonym) does not exempt an app from application of our policies." A disclaimer alone doesn't fix a deceptive purpose.
- Manipulated media, 4.2: "Exceptions may be provided for public interest, clearly artificial images, manipulated media with user-facing disclaimers or watermarks, or obvious satire or parody." Watermarks are a recognised mitigation.
- AI-generated content: "Apps that generate content using AI must contain in-app user reporting or flagging features …". Developers must also ensure apps don't generate "content that can deceive users or enable dishonest behaviors." This likely applies to the optional neural mode.
- Payments: in-app unlocks "must use Google Play's billing system for those transactions unless Section 3, 8, or 9 applies". Alternative billing and external links are allowed only "in eligible countries/regions" after enrolling in the relevant programme.

### Apple App Store

Source: [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) ("Last Updated: October 16, 2026"). There is no academic clause; "student" appears only in unrelated contexts.

- 1.1.6: "False information and features, including inaccurate device data or trick/joke functionality, such as fake location trackers. Stating that the app is 'for entertainment purposes' won't overcome this guideline."
- 1.2: "Apps that enable users to create, generate, upload, share, or otherwise contribute content … This includes … AI content creation apps. To prevent abuse, such apps must include: A method for filtering objectionable material … A mechanism to report offensive content … The ability to block abusive users … Published contact information …"
- 2.3: "make sure all your app metadata … accurately reflect the app's core experience". 2.3.1(b): "if you're dishonest, we don't want to do business with you."
- 5 Legal: "Apps must comply with all legal requirements in any location where you make them available … apps that solicit, promote, or encourage criminal or clearly reckless behavior will be rejected."
- 3.1.1: "If you want to unlock features or functionality within your app … you must use in-app purchase." 3.1.1(a): link-out entitlements "are not required for developers to include buttons, external links, or other calls to action in their United States storefront apps."

### Google Ads (marketing, for reference)

Source: [Enabling dishonest behavior](https://support.google.com/adspolicy/answer/6016086?hl=en). It bans "Services or products that enable academic dishonesty, like essay or thesis generators". It also says: "Don't use language that suggests your product can be used to cheat or deceive. For example, avoid phrases like 'fool the system' or 'get away with anything'."

## Where each provider can pay out

"Yes" means the country appears on the provider's own list. Sources: [Stripe global](https://stripe.com/global), [Stripe India invite-only](https://support.stripe.com/questions/moving-to-invite-only-in-india), [Paddle countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle), [Paddle payouts](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid), [Lemon Squeezy countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries), [PayPal Payouts country table](https://developer.paypal.com/docs/payouts/standard/reference/country-feature/) (updated October 2, 2026), [Google Play merchant locations](https://support.google.com/googleplay/android-developer/answer/9306917?hl=en), [Apple receiving payments](https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments/), [Apple payment thresholds](https://developer.apple.com/help/app-store-connect/reference/reporting/minimum-payment-threshold/).

| Merchant country | Stripe | Paddle¹ | Lemon Squeezy² | PayPal³ | Google Play merchant | Apple⁴ |
|---|---|---|---|---|---|---|
| US, UK, Canada, Australia, most of the EU | Yes | Yes | Bank | Yes | Yes | Yes |
| UAE | Yes | Yes | Bank | Yes | Yes | Yes |
| India | **Preview, invite-only** | Yes | Bank only with a pre-approved Stripe account, otherwise PayPal | "Receive and withdraw" (cannot send payouts) | Yes (INR) | Yes |
| **Pakistan** | No | Yes | Bank | **No** | Yes (PKR) | ? |
| **Bangladesh** | No | Yes | Bank | **No** | Yes | ? |
| **Sri Lanka** | No | Yes | Bank | **No** | Yes | Yes |
| **Nepal** | No | Yes | **No bank payouts**; PayPal only if PayPal serves Nepal (?) | **No** | **No** | Yes (5% advance tax) |
| Indonesia | Preview | Yes | Bank | Yes | Yes | Yes |
| Philippines | No | Yes | Bank | Yes | Yes | Yes |
| Nigeria | "Extended network" (via Paystack) | Yes | Bank | **No** | Yes | ? |
| Kenya | "Extended network" (via Paystack) | Yes | Bank | Yes | Yes | ? |
| Egypt | No | Yes | Bank | **No** | Yes | ? |
| Brazil | Yes | Yes | **No bank payouts**, PayPal only | Yes | Yes | Yes |
| Russia, Belarus | No | **No** | No⁵ | No | Listed "Yes" (not cross-checked against sanctions notices) | ? |
| Iran, Syria, Cuba, North Korea | No | **No** | No⁵ | No | Not listed | ? |

1. Paddle: "Paddle works with software businesses anywhere in the world with the exception of the unsupported countries listed below." Those countries are Afghanistan, Belarus, Myanmar, Central African Republic, Cuba, the occupied regions of Ukraine, DR Congo, Haiti, Iran, Iraq, Libya, Mali, Netherlands Antilles, Nicaragua, North Korea, Russia, Somalia, South Sudan, Sudan, Syria, Venezuela, Yemen and Zimbabwe. Payouts are monthly, "either via wire transfer or Payoneer", with a minimum of $100.
2. Lemon Squeezy: merchants must be able to "receive bank or PayPal payouts". The bank payout list names 119 countries; PayPal payouts cover the rest.
3. PayPal: based on the Payouts eligibility table, which is the only official country list that could be fetched. The general [worldwide page](https://www.paypal.com/us/webapps/mpp/country-worldwide) returned 403. "No" means the country is absent from that table.
4. Apple publishes no list of countries it pays. "Yes" means the country is named on the payment-threshold table or the receiving-payments page. "?" means unverified, not unsupported: countries missing from the threshold table fall under the default 40 USD threshold. Apple says that if your bank can't be found in App Store Connect, "it may be that Apple can't send payments to that bank". Enrolment is open in "more than 220 countries or regions".
5. Lemon Squeezy's lists block buyers in these countries, and they don't appear on its bank payout list.

The [Stripe Atlas docs](https://docs.stripe.com/atlas) describe Atlas as the route for founders outside Stripe's countries: form a US company, then use Stripe US. Atlas's own country eligibility was not verified.

## What this means for how Inkcadence describes itself and charges

1. **Describe the product, not the use case.** For example: "Write anything in your own handwriting. Photograph pages you've already written; Inkcadence learns your hand and renders your text as PNG or PDF." Training on old assignments is fine to describe as "pages you've written". The risk comes from presenting the **output** as something to hand in.
2. **Remove the trigger words from the public surface.**
   - `index.html`: the meta keywords "handwritten assignment generator" and the description "learns your handwriting from your own old assignments" are the main problems. Also change the "Format assignment" button, the "Assignment 4 —" sample text and "Lined A4 (assignment lines)".
   - `docs/index.html`: the "Exam lined" and "blank essay" paper presets and the "Neat exam" / "exam-neat" style names.
   - Suggested replacements: "Ruled A4", "Blank A4", "Grid A4", "Neat", "Everyday", "Format text".
3. **Hold these product lines**, because each one keeps Inkcadence out of a named ban:
   - Never generate the words (no LLM writing).
   - Learn only the user's own hand, with an "this is my handwriting" attestation at upload.
   - No signature or document features.
   - Never claim "undetectable" or offer anti-detection features. Call the variation "natural variation".
4. **Keep and promote the disclosures.** The docs already say the tool isn't for signatures, certificates or work done under exam conditions. Put a matching clause in the Terms of Service: "don't submit output where your institution requires the work to be handwritten by you." Keep the existing optional AI-assisted watermark and write provenance into PDF and PNG metadata. Google Play explicitly accepts "user-facing disclaimers or watermarks", and it shows payment reviewers good faith.
5. **Charging.**
   - Stripe has no academic clause, so it's the easiest provider to get approved by. It needs a business in a Stripe country, though: Pakistan, Bangladesh, Sri Lanka and Nepal aren't on the list, India is invite-only, and Atlas is the workaround.
   - Paddle and Lemon Squeezy pay out across most of South Asia: Paddle by wire or Payoneer; Lemon Squeezy by bank transfer to Pakistan, Bangladesh and Sri Lanka. But they carry the explicit essay-mill bans, so apply only after the rewording in points 1–2, and ask Lemon Squeezy to pre-clear the product.
   - PayPal can't pay out to Pakistan, Bangladesh, Sri Lanka or Nepal according to its own Payouts table.
6. **Native apps are viable** if the listing follows points 1–4.
   - Paid unlocks must go through Apple in-app purchase and Google Play Billing. Exceptions: link-outs on Apple's US storefront and Play's enrolled alternative-billing regions.
   - Add in-app "report" and contact options to satisfy Apple 1.2 and Play's AI-generated content policy if the neural mode counts as generative.
   - Google Play accepts merchants in India, Pakistan, Bangladesh and Sri Lanka, but not Nepal.
   - Apple pays out to Nepal; payouts to Pakistan and Bangladesh are unverified.

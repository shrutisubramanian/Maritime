/**
 * Terms & Conditions copy.
 *
 * Two documents, because the obligations differ by side of the marketplace:
 * a client (buyer) agreeing to use the platform, and a supplier / service
 * provider publishing listings on it. The /terms page renders one at a time
 * behind a toggle; nothing else in the app should hard-code this text.
 *
 * Section titles carry no numbers — the page numbers them in order, so adding
 * or removing a clause never leaves the sequence out of step.
 */

export interface TermsSection {
  title: string;
  paragraphs: string[];
  points?: string[];
  /** Paragraphs that belong after the bullet list. */
  afterPoints?: string[];
}

export interface TermsDocument {
  id: 'client' | 'provider';
  tab: string;
  title: string;
  updated: string;
  sections: TermsSection[];
}

export const TERMS_UPDATED = '29 October 2026';

export const CLIENT_TERMS: TermsDocument = {
  id: 'client',
  tab: 'Client',
  title: 'Client Terms & Conditions',
  updated: TERMS_UPDATED,
  sections: [
    {
      title: 'Introduction',
      paragraphs: [
        'Welcome to Nhaav.',
        'Nhaav is a business-to-business maritime platform that helps clients discover suppliers, find maritime service providers, and submit procurement-related enquiries.',
        'These Client Terms & Conditions ("Terms") govern your use of Nhaav as a client or buyer. By registering for an account or using the platform\'s client features, you agree to these Terms.',
      ],
    },
    {
      title: 'Account Registration',
      paragraphs: [
        'Clients must provide accurate, complete, and up-to-date information when creating and maintaining an account.',
        'You agree to:',
      ],
      points: [
        'Provide genuine personal and business contact details.',
        'Keep your login credentials confidential.',
        'Use your account only for legitimate business purposes.',
        'Update your information when material details change.',
        'Notify Nhaav if you suspect unauthorized access to your account.',
      ],
      afterPoints: [
        'You must not impersonate another individual or business, misrepresent your authority, or use another person\'s account without permission.',
      ],
    },
    {
      title: 'Use of the Marketplace',
      paragraphs: [
        'Nhaav enables clients to discover suppliers, maritime service providers, and their listed offerings.',
        'Clients agree to use marketplace information responsibly and only for legitimate business purposes.',
        'You must not:',
      ],
      points: [
        'Submit false, misleading, or fraudulent enquiries.',
        'Use the platform to harass, threaten, or deceive other users.',
        'Collect or use business contact information for spam or unauthorized marketing.',
        'Attempt to access restricted information or another user\'s account.',
        'Interfere with the platform\'s security or normal operation.',
      ],
    },
    {
      title: 'Enquiries and Procurement Requests',
      paragraphs: [
        'Clients are responsible for ensuring that the information provided in enquiries and procurement requests is accurate and sufficiently clear.',
        'You should provide relevant specifications, quantities, delivery requirements, timelines, and other information necessary for a supplier or service provider to assess your request.',
        'Submitting an enquiry through Nhaav does not guarantee a response, quotation, product availability, service availability, or successful transaction.',
        'Clients are responsible for reviewing quotations, confirming commercial terms, and conducting appropriate due diligence before proceeding with a business arrangement.',
      ],
    },
    {
      title: 'Business Relationships',
      paragraphs: [
        'Nhaav facilitates business discovery and connections between clients, suppliers, and service providers. Unless expressly agreed otherwise in a separate written agreement, Nhaav is not a party to transactions independently negotiated between users.',
        'Clients are responsible for evaluating suppliers and service providers before entering into contracts or making business commitments.',
        'Pricing, payment terms, delivery schedules, warranties, service scope, and other commercial obligations should be confirmed directly between the relevant parties.',
        'Nhaav does not guarantee the accuracy of every user-submitted statement or the quality, suitability, or performance of a third party\'s products or services.',
      ],
    },
    {
      title: 'Business Information and Confidentiality',
      paragraphs: [
        'Clients must respect the confidentiality of information shared by suppliers and service providers.',
        'You must not disclose, reproduce, or misuse confidential quotations, documents, commercial information, or proprietary materials without appropriate authorization.',
        'You are responsible for ensuring that any documents or information you submit through Nhaav may lawfully be shared for the intended purpose.',
      ],
    },
    {
      title: 'Account Access and Subscription Plans',
      paragraphs: [
        'Access to certain Nhaav features may be subject to an applicable subscription plan and account access-pass rules.',
        'Where a plan applies, the relevant pricing, pass validity, session duration, and account-specific restrictions will be displayed or communicated as applicable.',
        'Access passes are associated with the account to which they are issued and cannot be transferred between separate accounts unless Nhaav expressly permits otherwise.',
        'Clients must not circumvent access restrictions, misuse sessions, or attempt to obtain paid features without authorization.',
      ],
    },
    {
      title: 'Privacy and Data Protection',
      paragraphs: [
        'Nhaav processes account information, business details, enquiries, and technical information in accordance with its Privacy Policy and applicable law.',
        'Clients should not submit unnecessary personal, confidential, or sensitive information through the platform.',
        'Please consult Nhaav\'s Privacy Policy for further information about how information is collected, used, stored, and protected.',
      ],
    },
    {
      title: 'Intellectual Property',
      paragraphs: [
        'Nhaav retains its rights in the platform, branding, software, design, and original platform content, except where otherwise stated.',
        'Clients retain responsibility for materials they submit and must ensure they have the necessary rights and permissions to share them.',
        'You may not copy, reproduce, or commercially exploit Nhaav\'s protected content or platform components without authorization.',
      ],
    },
    {
      title: 'Suspension and Termination',
      paragraphs: [
        'Nhaav may restrict or suspend an account where reasonably necessary to address suspected fraud, unauthorized access, violations of these Terms, security risks, or legal obligations.',
        'Where appropriate and legally permissible, Nhaav may provide notice and an opportunity to resolve the issue.',
        'Clients may stop using the platform or request account closure through the available support process. Applicable payment, record-retention, and legal obligations may continue after account closure.',
      ],
    },
    {
      title: 'Disclaimer and Limitation of Liability',
      paragraphs: [
        'Nhaav provides a platform for business discovery and procurement-related connections. It does not guarantee that an enquiry will result in a quotation, contract, sale, or successful business relationship.',
        'To the extent permitted by applicable law, Nhaav is not responsible for independent commercial agreements, representations, or performance obligations between clients and third parties.',
        'Nothing in these Terms excludes liability that cannot legally be excluded under applicable law.',
      ],
    },
    {
      title: 'Changes to These Terms',
      paragraphs: [
        'Nhaav may update these Terms to reflect changes in the platform, business operations, or applicable law.',
        'Updated Terms will be published with a revised date. Where legally required, Nhaav will provide notice or obtain renewed acceptance.',
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [
        'For questions or concerns about these Terms, please contact Nhaav through the official support details published on our website.',
      ],
    },
  ],
};

export const PROVIDER_TERMS: TermsDocument = {
  id: 'provider',
  tab: 'Supplier & Service Provider',
  title: 'Supplier & Service Provider Terms & Conditions',
  updated: TERMS_UPDATED,
  sections: [
    {
      title: 'Introduction',
      paragraphs: [
        'Welcome to Nhaav.',
        'Nhaav is a business-to-business maritime platform that helps suppliers and service providers present their businesses, showcase their offerings, and connect with potential clients.',
        'These Terms & Conditions ("Terms") govern your use of Nhaav as a supplier or service provider. By registering, submitting a business profile, publishing a listing, or using the platform\'s provider features, you agree to these Terms.',
      ],
    },
    {
      title: 'Account Registration and Business Information',
      paragraphs: [
        'Suppliers and service providers must provide accurate, complete, and current information about themselves and their businesses.',
        'You agree to:',
      ],
      points: [
        'Provide genuine business and contact details.',
        'Ensure that you are authorized to represent the business associated with your account.',
        'Keep your business profile and contact information up to date.',
        'Provide accurate descriptions of your products, services, capabilities, and operating areas.',
        'Notify Nhaav of material changes to your business information.',
      ],
      afterPoints: [
        'You must not impersonate another business, misrepresent your qualifications, or provide false registration or identification details.',
      ],
    },
    {
      title: 'Business Verification',
      paragraphs: [
        'Nhaav may request documents or additional information to review your business profile and verify submitted details.',
        'You agree to provide genuine, valid, and authorized documents when requested. You must not submit forged, altered, misleading, or unauthorized materials.',
        'Nhaav may approve, reject, suspend, or request further information about a profile based on its verification process and applicable platform requirements.',
        'Verification indicates only that the checks specified by Nhaav have been completed. It does not guarantee your business\'s financial condition, service quality, regulatory compliance, or future performance.',
        'You must notify Nhaav if information relevant to your verification becomes inaccurate or materially changes.',
      ],
    },
    {
      title: 'Marketplace Listings',
      paragraphs: [
        'Suppliers and service providers may submit eligible offerings for display on the Nhaav marketplace.',
        'You are responsible for ensuring that every listing:',
      ],
      points: [
        'Accurately describes your products or services.',
        'Contains current and relevant business information.',
        'Does not make false, deceptive, or unsupported claims.',
        'Complies with applicable laws and regulations.',
        'Does not infringe intellectual property, confidentiality, or other legal rights.',
        'Does not include prohibited, unlawful, or misleading content.',
      ],
      afterPoints: [
        'Nhaav may review, approve, reject, suspend, or remove listings that do not meet its requirements.',
        'Submitting a listing does not guarantee publication, visibility in a particular position, customer enquiries, sales, or business contracts.',
      ],
    },
    {
      title: 'Listing Duration and Applicable Fees',
      paragraphs: [
        'Marketplace listings may be subject to a listing fee and an applicable publication period, as communicated by Nhaav when you submit a listing.',
        'The standard listing arrangements are ₹1,000 per listing for one month of marketplace visibility, or ₹10,000 per listing for one year, subject to payment verification and any required listing approval.',
        'The listing period begins when the listing is activated. Expired listings may be removed from the active marketplace and may require renewal or a new submission to be displayed again.',
        'Marketplace listing charges are separate from any applicable platform access subscription. Payment does not guarantee business leads, enquiries, sales, or contracts.',
      ],
    },
    {
      title: 'Professional Conduct',
      paragraphs: [
        'Suppliers and service providers are expected to communicate professionally and deal honestly with clients and other platform users.',
        'You agree to:',
      ],
      points: [
        'Respond to enquiries in a timely and professional manner where reasonably possible.',
        'Provide accurate quotations and descriptions of your capabilities.',
        'Communicate material changes to pricing, availability, delivery schedules, or service scope.',
        'Avoid misleading claims about certifications, experience, capacity, or business relationships.',
        'Respect the confidentiality of client enquiries and information.',
        'Comply with applicable laws and relevant contractual obligations.',
      ],
      afterPoints: [
        'You must not use Nhaav to engage in fraud, harassment, spam, unlawful discrimination, deceptive practices, or other prohibited conduct.',
      ],
    },
    {
      title: 'Enquiries and Commercial Transactions',
      paragraphs: [
        'Nhaav provides a platform for business discovery and facilitates connections between potential clients and providers.',
        'You are responsible for reviewing each enquiry, deciding whether it suits your business, and ensuring that any quotation or proposal you provide is accurate.',
        'Unless expressly agreed otherwise in a separate written agreement, Nhaav is not a party to contracts negotiated between suppliers, service providers, and clients.',
        'You are responsible for confirming the terms of any transaction, including pricing, scope of work, delivery, timelines, warranties, payment arrangements, and applicable legal requirements.',
        'Nhaav does not guarantee that a listing will generate enquiries or that an enquiry will result in a commercial agreement.',
      ],
    },
    {
      title: 'Confidentiality and Client Information',
      paragraphs: [
        'Information received through client enquiries may contain confidential business information, specifications, quotations, or operational details.',
        'You agree to use such information only for legitimate business evaluation and communication relating to the relevant enquiry.',
        'You must not disclose, sell, misuse, or distribute confidential client information without appropriate authorization or a lawful basis.',
        'You must not use contact details obtained through Nhaav for unrelated spam, unsolicited bulk marketing, or other unauthorized purposes.',
      ],
    },
    {
      title: 'Intellectual Property and Listing Content',
      paragraphs: [
        'You retain responsibility for the content and materials you submit, including descriptions, photographs, logos, certificates, and other business documents.',
        'You must have the necessary rights and permissions to submit and display these materials.',
        'By submitting listing content, you authorize Nhaav to host, reproduce, and display it as reasonably necessary to operate the platform, review your submission, and present your approved listing during its publication period.',
        'Nhaav retains its rights in its own platform, branding, software, design, and original content.',
      ],
    },
    {
      title: 'Account Security',
      paragraphs: [
        'You are responsible for protecting your account credentials and notifying Nhaav of suspected unauthorized access.',
        'You must not share access passes between separate accounts, bypass platform restrictions, manipulate verification processes, or attempt to access another user\'s account or restricted administrative functionality.',
        'Nhaav may restrict access where reasonably necessary to protect the platform, users, or business information.',
      ],
    },
    {
      title: 'Privacy and Data Protection',
      paragraphs: [
        'Nhaav may process business profile details, contact information, verification documents, listing content, enquiries, and relevant account records to operate and secure the platform.',
        'You must ensure that you are authorized to submit any personal or business information you provide.',
        'Information submitted for private verification must not be placed in public listing fields unless it is specifically intended and authorized for publication.',
        'Please refer to Nhaav\'s Privacy Policy for further details about data handling and applicable user rights.',
      ],
    },
    {
      title: 'Suspension, Removal, and Termination',
      paragraphs: [
        'Nhaav may suspend or remove a listing, restrict an account, or request additional information where reasonably necessary to address inaccurate information, suspected fraud, policy violations, security risks, legal requirements, or concerns regarding the integrity of the marketplace.',
        'Where appropriate and legally permissible, Nhaav may provide notice and an opportunity to resolve the issue.',
        'You may stop using Nhaav or request account closure through the available support process. Account closure does not automatically remove legal or contractual obligations arising before closure.',
        'The treatment of active listings and any related payments following suspension or termination will be governed by applicable platform policies and law.',
      ],
    },
    {
      title: 'Disclaimer and Limitation of Liability',
      paragraphs: [
        'Nhaav facilitates business discovery and does not guarantee the accuracy of every user-submitted claim, the suitability of a supplier or service provider, or the outcome of any commercial interaction.',
        'Suppliers and service providers remain responsible for their own representations, products, services, contracts, and legal obligations.',
        'To the extent permitted by applicable law, Nhaav is not responsible for independent agreements or performance obligations between users.',
        'Nothing in these Terms excludes liability that cannot legally be excluded under applicable law.',
      ],
    },
    {
      title: 'Changes to These Terms',
      paragraphs: [
        'Nhaav may update these Terms to reflect changes in its platform, marketplace policies, or applicable law.',
        'Updated Terms will be published with a revised date. Where legally required, Nhaav will provide notice or obtain renewed acceptance.',
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [
        'For questions regarding your account, business profile, verification, or marketplace listing, contact Nhaav through the official support details published on our website.',
      ],
    },
  ],
};

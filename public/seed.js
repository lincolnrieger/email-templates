// Starter categories and example templates.
//
// These are loaded into the library the very first time the app opens (and
// again from Settings -> "Add the starter examples" if you want them back).
// After that, everything lives in the database and can be edited or deleted
// in the app. Changing this file does not change templates already saved.
//
// Prices, capacities and times below are EXAMPLES ONLY. Check them against
// current rates before sending.

window.SEED = (() => {
  const categories = [
    ['general', 'General Enquiries'],
    ['accommodation', 'Accommodation'],
    ['bookings', 'Bookings & Confirmations'],
    ['payments', 'Payments & Invoices'],
    ['cancellations', 'Cancellations & Rescheduling'],
    ['activities', 'Activities & Day Visits'],
    ['catering', 'Catering'],
    ['feedback', 'Customer Feedback & Complaints'],
    ['followups', 'Follow-ups'],
    ['internal', 'Internal Administration'],
    ['other', 'Other'],
  ].map(([id, name]) => ({ id: 'cat-' + id, name }));

  const SIGN = '\n\nKind regards,\n\n[Your Name]\nWoodhouse Adventure Park';
  const EXAMPLE = 'Starter example. Figures are placeholders, so check current rates before sending.';
  const now = new Date().toISOString();

  // Shared building details, used by more than one template.
  const B = {
    'Rymill Centre': { Capacity: '64 guests across 8 bunk rooms', 'Minimum Numbers': '30 guests', Price: '$38 per person per night', 'Check-in': '3:00 pm', 'Check-out': '10:00 am', Facilities: 'a fully equipped commercial kitchen, a large dining hall, heated bathrooms and a covered outdoor area' },
    'Old Manor': { Capacity: '28 guests across 6 rooms', 'Minimum Numbers': '12 guests', Price: '$45 per person per night', 'Check-in': '3:00 pm', 'Check-out': '10:00 am', Facilities: 'a self-catering kitchen, a lounge with open fireplace and a private garden' },
    'Hooper Bunkhouse': { Capacity: '36 guests in bunk rooms', 'Minimum Numbers': '15 guests', Price: '$32 per person per night', 'Check-in': '3:00 pm', 'Check-out': '10:00 am', Facilities: 'a self-catering kitchen, shared bathrooms and a fire pit area' },
    'Bell Tents': { Capacity: '6 tents, each sleeping up to 4', 'Minimum Numbers': '1 tent', Price: '$120 per tent per night', 'Check-in': '2:00 pm', 'Check-out': '10:00 am', Facilities: 'raised timber platforms, beds with mattresses, a shared camp kitchen and nearby amenities block' },
    'Hanson Chalet': { Capacity: '12 guests', 'Minimum Numbers': '6 guests', Price: '$420 per night for the chalet', 'Check-in': '3:00 pm', 'Check-out': '10:00 am', Facilities: 'a kitchen, a living area with heating, two bathrooms and a deck overlooking the park' },
    'Chambers Chalet': { Capacity: '12 guests', 'Minimum Numbers': '6 guests', Price: '$420 per night for the chalet', 'Check-in': '3:00 pm', 'Check-out': '10:00 am', Facilities: 'a kitchen, a living area with heating, two bathrooms and a deck overlooking the park' },
    'Group Camping': { Capacity: 'up to 150 campers across several sites', 'Minimum Numbers': '10 campers', Price: '$18 per person per night', 'Check-in': '1:00 pm', 'Check-out': '11:00 am', Facilities: 'powered and unpowered sites, hot showers, toilets and a camp kitchen shelter' },
  };
  const buildings = Object.keys(B);
  const pick = (name, keys) => Object.fromEntries(keys.map((k) => [k, B[name][k]]));
  const vars = (keys, extra = {}) => buildings.map((name, i) => ({
    id: 'v' + (i + 1),
    building: name,
    values: { ...pick(name, keys), ...(extra[name] || {}) },
    ownEmail: false,
    subject: '',
    body: '',
  }));

  const T = (id, o) => ({
    id: 'tpl-' + id,
    name: '', categoryId: '', description: '', subject: '', body: '',
    keywords: [], notes: '', favourite: false, fields: [], variations: [],
    createdAt: now, updatedAt: now,
    ...o,
  });

  const templates = [
    T('accom-availability', {
      name: 'Accommodation Availability Response',
      categoryId: 'cat-accommodation',
      description: 'Reply to an accommodation enquiry with availability, capacity and pricing for the chosen building.',
      subject: 'Accommodation availability: [Building Name], [Arrival Date]',
      body:
`Dear [Customer Name],

Thank you for your enquiry about staying at Woodhouse Adventure Park.

I'm pleased to confirm that [Building Name] is currently available from [Arrival Date] to [Departure Date].

[Building Name] accommodates [Capacity], with a minimum booking of [Minimum Numbers]. The rate is [Price]. The building includes [Facilities].

Check-in is from [Check-in] and check-out is by [Check-out].

Availability isn't held until a booking is confirmed, so please let me know if you'd like to go ahead and I'll send through a booking form and deposit invoice.` + SIGN,
      keywords: ['availability', 'enquiry', 'quote', 'rates', 'vacancy'],
      fields: ['Capacity', 'Minimum Numbers', 'Price', 'Check-in', 'Check-out', 'Facilities'],
      variations: vars(['Capacity', 'Minimum Numbers', 'Price', 'Check-in', 'Check-out', 'Facilities']),
      favourite: true,
      notes: EXAMPLE + ' Check the booking calendar before confirming availability.',
    }),

    T('accom-unavailable', {
      name: 'Accommodation Not Available',
      categoryId: 'cat-accommodation',
      description: 'Let a customer know their requested building or dates are booked and suggest alternatives.',
      subject: 'Re: Accommodation enquiry for [Arrival Date]',
      body:
`Dear [Customer Name],

Thank you for your enquiry about staying at Woodhouse Adventure Park.

Unfortunately [Building Name] is already booked from [Arrival Date] to [Departure Date].

We do have [Alternative Option] available on those dates, or [Building Name] is free on [Alternative Dates]. I'd be happy to pencil either option in for you.` + SIGN,
      keywords: ['booked out', 'unavailable', 'full', 'alternative', 'no availability'],
      notes: 'Suggest the closest building in size where possible.',
    }),

    T('booking-confirmation', {
      name: 'Accommodation Booking Confirmation',
      categoryId: 'cat-bookings',
      description: 'Confirm an accommodation booking with dates, check-in times and arrival instructions.',
      subject: 'Booking confirmed: [Building Name], [Arrival Date] (Ref [Booking Number])',
      body:
`Dear [Customer Name],

Thank you for your booking. I'm pleased to confirm the following:

**Booking number:** [Booking Number]
**Accommodation:** [Building Name]
**Arrival:** [Arrival Date], from [Check-in]
**Departure:** [Departure Date], by [Check-out]
**Total:** [Price]

**On arrival:** [Arrival Instructions]

Please bring your own linen, pillows and towels unless you've arranged a linen hire. A copy of our site rules and a map of the park are attached.

If anything changes before your stay, just reply to this email.` + SIGN,
      keywords: ['confirmed', 'confirmation', 'booking', 'arrival', 'check in'],
      fields: ['Check-in', 'Check-out', 'Arrival Instructions'],
      variations: vars(['Check-in', 'Check-out'], {
        'Rymill Centre': { 'Arrival Instructions': 'please come to the Park Office to collect your keys before driving down to the Rymill Centre car park.' },
        'Old Manor': { 'Arrival Instructions': 'the Old Manor key safe code will be sent by text on the morning of your arrival.' },
        'Hooper Bunkhouse': { 'Arrival Instructions': 'please come to the Park Office to collect your keys. Hooper Bunkhouse is a short walk from the main car park.' },
        'Bell Tents': { 'Arrival Instructions': 'please check in at the Park Office, where a staff member will walk you down to your tents.' },
        'Hanson Chalet': { 'Arrival Instructions': 'the chalet key safe code will be sent by text on the morning of your arrival.' },
        'Chambers Chalet': { 'Arrival Instructions': 'the chalet key safe code will be sent by text on the morning of your arrival.' },
        'Group Camping': { 'Arrival Instructions': 'please check in at the Park Office so we can show you to your allocated sites.' },
      }),
      favourite: true,
      notes: EXAMPLE + ' Attach the site rules PDF and park map before sending.',
    }),

    T('deposit-reminder', {
      name: 'Deposit Payment Reminder',
      categoryId: 'cat-payments',
      description: 'Friendly reminder that a booking deposit is due to secure the dates.',
      subject: 'Deposit reminder: booking [Booking Number]',
      body:
`Dear [Customer Name],

This is a friendly reminder that the deposit of [Payment Amount] for your booking ([Booking Number]) is due by [Due Date].

Your dates are held until then. Once the deposit is received, your booking will be confirmed and I'll send through a confirmation.

Payment can be made by direct deposit using your booking number as the reference, or by card over the phone. Our bank details are on the attached invoice.

If you've already paid, thank you, and please disregard this email.` + SIGN,
      keywords: ['deposit', 'reminder', 'overdue', 'payment due', 'outstanding'],
      favourite: true,
    }),

    T('invoice-attached', {
      name: 'Invoice Attached',
      categoryId: 'cat-payments',
      description: 'Send an invoice with payment terms and how to pay.',
      subject: 'Invoice for booking [Booking Number]',
      body:
`Dear [Customer Name],

Please find attached the invoice for your booking ([Booking Number]).

Amount due: [Payment Amount]
Due date: [Due Date]

Payment can be made by direct deposit using your booking number as the reference, or by card over the phone. Bank details are on the invoice.

Please let me know if you need the invoice made out to a different organisation or need a purchase order number added.` + SIGN,
      keywords: ['invoice', 'bill', 'payment', 'tax invoice', 'purchase order'],
      notes: 'Remember to attach the invoice PDF from the booking system.',
    }),

    T('final-payment', {
      name: 'Final Balance Due',
      categoryId: 'cat-payments',
      description: 'Request the remaining balance ahead of arrival.',
      subject: 'Final balance due: booking [Booking Number]',
      body:
`Dear [Customer Name],

We're looking forward to welcoming you on [Arrival Date].

The remaining balance of [Payment Amount] for booking [Booking Number] is due by [Due Date]. Please use your booking number as the payment reference.

If your final numbers have changed, let me know and I'll update the invoice before you pay.` + SIGN,
      keywords: ['balance', 'final payment', 'remaining', 'numbers'],
    }),

    T('cancellation-confirmation', {
      name: 'Cancellation Confirmation',
      categoryId: 'cat-cancellations',
      description: 'Confirm a cancelled booking and explain any refund or retained deposit.',
      subject: 'Cancellation confirmed: booking [Booking Number]',
      body:
`Dear [Customer Name],

As requested, I've cancelled your booking ([Booking Number]) for [Arrival Date].

[Refund Details]

We're sorry you won't be joining us this time and hope to welcome you to Woodhouse in the future.` + SIGN,
      keywords: ['cancel', 'cancelled', 'refund', 'deposit'],
      notes: 'Refund details: state the amount and expected timeframe, or that the deposit is retained under the cancellation policy.',
    }),

    T('reschedule', {
      name: 'Rescheduling Request Received',
      categoryId: 'cat-cancellations',
      description: 'Acknowledge a request to move a booking and outline the next step.',
      subject: 'Re: Changing your booking [Booking Number]',
      body:
`Dear [Customer Name],

Thank you for letting us know you'd like to move your booking ([Booking Number]) from [Arrival Date].

I've checked availability and [New Dates] are available. If those suit, reply to confirm and I'll transfer your booking and deposit across.

Please note the new dates aren't held until you confirm.` + SIGN,
      keywords: ['reschedule', 'change dates', 'move booking', 'postpone', 'transfer'],
    }),

    T('day-visit', {
      name: 'Activities & Day Visit Enquiry',
      categoryId: 'cat-activities',
      description: 'Reply to a school or group asking about day visits and instructor-led activities.',
      subject: 'Day visit and activities at Woodhouse',
      body:
`Dear [Customer Name],

Thank you for your interest in a day visit to Woodhouse Adventure Park.

Our instructor-led activities include the high ropes course, giant swing, low ropes, archery, orienteering and the maze. Sessions run for about 90 minutes and groups usually choose two to four activities for the day.

For a group of [Group Size] on [Visit Date], I'd suggest [Suggested Program]. The cost would be [Price].

Let me know if you'd like to go ahead or adjust the program and I'll pencil the date in for you.` + SIGN,
      keywords: ['day visit', 'activities', 'school', 'ropes', 'archery', 'program', 'instructor'],
      notes: EXAMPLE + ' Check instructor availability with the activities team before suggesting a program.',
    }),

    T('catering', {
      name: 'Catering Options',
      categoryId: 'cat-catering',
      description: 'Outline catering packages for a group booking and request dietary requirements.',
      subject: 'Catering for your stay: [Arrival Date]',
      body:
`Dear [Customer Name],

Thank you for asking about catering for your stay.

We offer full catering (breakfast, lunch and dinner) or individual meals for groups of 20 or more. Menus are attached, and meals are served in the dining hall at the times you choose.

To arrange catering, please send us your chosen meals and final numbers at least 14 days before arrival, along with any dietary requirements or allergies.` + SIGN,
      keywords: ['catering', 'meals', 'menu', 'food', 'dietary', 'allergies'],
      notes: 'Attach the current catering menu PDF.',
    }),

    T('complaint', {
      name: 'Complaint Acknowledgement',
      categoryId: 'cat-feedback',
      description: 'Acknowledge a complaint, apologise and explain what happens next.',
      subject: 'Re: Your recent stay at Woodhouse',
      body:
`Dear [Customer Name],

Thank you for taking the time to tell us about your experience. I'm sorry that [Issue Summary] fell short of what you should expect from Woodhouse.

I've passed your feedback to [Manager Name], who will look into it and contact you by [Response Date].

We appreciate you raising this with us, as it helps us improve.` + SIGN,
      keywords: ['complaint', 'unhappy', 'apology', 'sorry', 'issue', 'problem'],
      notes: 'Log the complaint in the feedback register before replying.',
    }),

    T('thank-you', {
      name: 'Thank You and Feedback Request',
      categoryId: 'cat-followups',
      description: 'Thank a group after their stay or visit and ask for feedback.',
      subject: 'Thank you for visiting Woodhouse',
      body:
`Dear [Customer Name],

Thank you for choosing Woodhouse Adventure Park. We hope your group enjoyed their time with us.

We'd really value your feedback. It only takes a couple of minutes: [Feedback Link]

If you'd like to book again, just reply to this email and I can check dates for you.` + SIGN,
      keywords: ['thank you', 'feedback', 'survey', 'after stay', 'review'],
    }),

    T('general-ack', {
      name: 'General Enquiry Acknowledgement',
      categoryId: 'cat-general',
      description: 'Holding reply when an enquiry needs checking before a full answer.',
      subject: 'Re: [Enquiry Subject]',
      body:
`Dear [Customer Name],

Thank you for contacting Woodhouse Adventure Park.

I'm just checking a few details for you and will be back in touch by [Response Date].

In the meantime, our opening hours, location and general information are on our website.` + SIGN,
      keywords: ['holding reply', 'acknowledge', 'received', 'enquiry'],
    }),

    T('internal-finance', {
      name: 'Booking Handover to Finance',
      categoryId: 'cat-internal',
      description: 'Internal note asking finance to raise an invoice or process a refund.',
      subject: 'Finance request: [Booking Number], [Customer Name]',
      body:
`Hi [Recipient Name],

Could you please [Request] for the booking below?

Booking number: [Booking Number]
Customer: [Customer Name]
Dates: [Arrival Date] to [Departure Date]
Amount: [Payment Amount]

Notes: [Notes]

Thanks,
[Your Name]`,
      keywords: ['finance', 'internal', 'refund request', 'raise invoice', 'accounts'],
    }),
  ];

  return { categories, templates, buildings };
})();

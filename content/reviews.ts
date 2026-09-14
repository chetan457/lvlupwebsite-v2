/**
 * PLACEHOLDER REVIEWS.
 * Replace with real, verbatim Google reviews before launch — these back the
 * AggregateRating in the structured data, and inventing them would be both
 * dishonest and a schema violation.
 */

export type Review = {
  name: string;
  stars: number;
  text: string;
  source: string;
};

export const reviews: Review[] = [
  {
    name: 'Aditya Rane',
    stars: 5,
    source: 'Google',
    text: 'Booked the recliner bay for my brother’s birthday. Controllers were clean, the AC was actually cold, and FC 26 was already installed so we could just start playing. Would recommend.',
  },
  {
    name: 'Faiz Qureshi',
    stars: 5,
    source: 'Google',
    text: 'Came on a Wednesday afternoon, place was almost empty and we got the off-peak rate. 2 hours of Tekken for ₹180. Screens are good and none of the controllers drifted.',
  },
  {
    name: 'Sneha Kulkarni',
    stars: 4,
    source: 'Google',
    text: 'Good setup and fair pricing. Parking after 8 pm was a pain, we went round the lane twice before we found a spot, so take an auto if you can. Staff let us extend by half an hour without any fuss. Losing a star for the parking only.',
  },
];

export type Faq = { question: string; answer: string };

export const faqs: Faq[] = [
  {
    question: 'Do I need to book ahead?',
    answer:
      'Not on a weekday afternoon — walk in and a bay is usually free. Evenings and weekends fill up, so send a WhatsApp before you leave home and we will keep a bay aside.',
  },
  {
    question: 'Is the rate per person or per bay?',
    answer:
      'Per bay, per hour — the figure covers whoever is on that couch.',
  },
  {
    question: 'What can I play?',
    answer:
      'PlayStation 5 only for now. Everything on the rack is installed and patched. Ask for a title we do not stock and we will download it ahead of your slot.',
  },
  {
    question: 'Is there an age limit?',
    answer:
      'No upper limit. Under-12s are welcome with an adult along. We will not put on an 18-rated game for a child, whatever the group says.',
  },
  {
    question: 'Can I book the whole place for a birthday?',
    answer:
      'Yes. Every bay, 10 seats and the sound system, on a 2-hour minimum. Message us with the date and we will check it is free.',
  },
  {
    question: 'How do I pay?',
    answer: 'UPI or cash at the counter. Party bookings take an advance to hold the date.',
  },
];

export const houseRules = [
  'Shoes off on the recliner platform. Everywhere else they stay on.',
  'Food comes from the counter, except a cake for a party booking. Wherever it came from, we ask you to keep it off the seats.',
  'Break a controller and we charge what a new one costs us, nothing on top. It has happened twice in 2 years.',
  'Cancel a party booking 24 hours ahead and the advance comes back. Do not turn up and we keep it.',
];

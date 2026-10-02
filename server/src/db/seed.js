const { userRepo, documentRepo, chunkRepo } = require("./repositories");
const { embed } = require("../rag/embeddings");
const { chunkText } = require("../rag");
const { logger } = require("../observability/logger");

const DEMO_USER = {
  email: "demo@example.com",
  password: "password123",
  name: "Demo User"
};

const SAMPLE_DOCUMENTS = [
  {
    title: "Refund Policy",
    content: `Customers can request a full refund within 30 days of purchase.
To start a refund, open the billing page and choose "Request refund", or email support@example.com with the order id.
Refunds are returned to the original payment method and usually appear within 5 to 7 business days.
Annual plans refunded after 30 days are prorated for the unused months. Add-on usage charges are not refundable.
Enterprise contracts follow the terms in the signed agreement.`
  },
  {
    title: "Remote Work Policy",
    content: `Employees may work remotely up to three days per week. Core collaboration hours are 10:00 to 15:00 in the employee's local time zone.
Every full-time employee receives a one-time home office equipment stipend of 500 dollars.
Managers approve remote schedules and may ask for an on-site day for team planning.
Employees working from another country for more than 30 days must notify People Operations for tax reasons.`
  },
  {
    title: "Product FAQ",
    content: `The product is a conversational assistant that streams answers token by token.
It supports retrieval over your own documents and tool calling for live data such as the current time and calculations.
The free plan includes 100 messages per month. The Pro plan is 20 dollars per month and includes unlimited messages and document uploads.
Support is available Monday to Friday, 9:00 to 18:00 UTC, with a median first response time of four hours.`
  }
];

async function seedUserKnowledge(userId) {
  for (const sample of SAMPLE_DOCUMENTS) {
    const document = documentRepo.create({ userId, title: sample.title });
    for (const piece of chunkText(sample.content)) {
      const embedding = await embed(piece);
      chunkRepo.create({ documentId: document.id, content: piece, embedding });
    }
  }
}

async function seed({ hashPassword }) {
  if (userRepo.count() > 0) {
    return { seeded: false };
  }

  const user = userRepo.create({
    email: DEMO_USER.email,
    name: DEMO_USER.name,
    passwordHash: hashPassword(DEMO_USER.password)
  });

  await seedUserKnowledge(user.id);
  logger.info("seeded demo workspace", { email: DEMO_USER.email });

  return { seeded: true, user };
}

module.exports = { seed, seedUserKnowledge, DEMO_USER, SAMPLE_DOCUMENTS };

import { setupDb } from "../src/db";
import { fireWebhookQueueWorker, processTransferQueueWorker } from "./workers";

await setupDb();

console.log('Workers are now running and processing jobs...');

// Keep the script running
process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');

  await fireWebhookQueueWorker.close();
  await processTransferQueueWorker.close();

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down workers...');

  await fireWebhookQueueWorker.close();
  await processTransferQueueWorker.close();

  process.exit(0);
});

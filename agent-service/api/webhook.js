const { postCast } = require('../lib/farcaster');
const { generateResponse } = require('../lib/openai');

// Environment variables (set in Vercel)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CUSTODY_PRIVATE_KEY = process.env.CUSTODY_PRIVATE_KEY;
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
const AGENT_FID = parseInt(process.env.AGENT_FID || '2634873');

/**
 * Vercel serverless function to handle Neynar webhook events
 */
module.exports = async (req, res) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;

    // Log the incoming event
    console.log('Received webhook event:', JSON.stringify(event, null, 2));

    // Validate event structure
    if (!event || !event.type || !event.data) {
      return res.status(400).json({ error: 'Invalid event structure' });
    }

    // Only process cast.created events
    if (event.type !== 'cast.created') {
      return res.status(200).json({ message: 'Event type ignored', type: event.type });
    }

    const cast = event.data;

    // Don't respond to our own casts
    if (cast.author?.fid === AGENT_FID) {
      return res.status(200).json({ message: 'Ignoring own cast' });
    }

    // Check if this is a mention or reply we should respond to
    const isMention = cast.text?.toLowerCase().includes('@claudeagent');
    const isReplyToUs = cast.parent_author?.fid === AGENT_FID;

    if (!isMention && !isReplyToUs) {
      return res.status(200).json({ message: 'Not a mention or reply to us' });
    }

    // Extract info for response
    const username = cast.author?.username || 'anon';
    const userMessage = cast.text || '';
    const parentHash = cast.hash;
    const parentFid = cast.author?.fid;

    console.log(`Processing ${isMention ? 'mention' : 'reply'} from @${username}: "${userMessage}"`);

    // Generate response with OpenAI
    const responseText = await generateResponse(
      OPENAI_API_KEY,
      userMessage,
      username,
      { isReply: isReplyToUs, isMention }
    );

    console.log(`Generated response: "${responseText}"`);

    // Post the reply
    const result = await postCast({
      custodyPrivateKey: CUSTODY_PRIVATE_KEY,
      signerPrivateKey: SIGNER_PRIVATE_KEY,
      fid: AGENT_FID,
      text: responseText,
      parentHash: parentHash,
      parentFid: parentFid
    });

    console.log(`Posted reply with hash: ${result.hash}`);

    return res.status(200).json({
      success: true,
      castHash: result.hash,
      respondedTo: {
        username,
        hash: parentHash,
        type: isMention ? 'mention' : 'reply'
      }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

const signMessage = async (message) => {
    if (!window.ethereum) throw new Error('Ethereum provider not found');
    
    const accounts = await window.ethereum.request({ 
      method: 'eth_requestAccounts' 
    });
    
    return await window.ethereum.request({
      method: 'personal_sign',
      params: [message, accounts[0]],
    });
  };
  
  const fetchJson = async (baseUrl, endpoint, options = {}) => {
    const { token, ...rest } = options;
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...rest.headers,
    };
  
    const response = await fetch(`${baseUrl}${endpoint}`, { ...rest, headers });
    console.log(`FETCH JSON: ${baseUrl}${endpoint}`);
    console.log(`FETCH JSON: ${response}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
  
    return response.json();
  };
  
  export const getNonce = async (baseUrl) => {
    const resp = await fetchJson(baseUrl, '/nonce');
    return resp.nonce; 
  };
  
  export const merchantSignup = async (baseUrl, { name, webhookUrl, chainIds }) => {
    console.log(`MERCHANT SIGNUP: ${name} ${webhookUrl} ${chainIds}`);
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];
    const nonce = await getNonce(baseUrl);
    console.log(`MERCHANT SIGNUP: ${address} ${nonce}`);
    
    const message = `Register merchant account for ${address} with name ${name} and unique key: ${nonce}`;
    const signature = await signMessage(message);

    console.table( { address, name, webhookUrl, signature, nonce, chainIds });
  
    return fetchJson(baseUrl, '/merchants/signup', {
      method: 'POST',
      body: JSON.stringify({
        name,
        address,
        webhookUrl,
        signature,
        nonce,
        chainIds,
      }),
    });
  };
  
  export const merchantLogin = async (baseUrl) => {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];
    const nonce = await getNonce(baseUrl);
  
    const message = `Login merchant for address ${address} with nonce ${nonce}`;
    const signature = await signMessage(message);
  
    return fetchJson(baseUrl, '/merchants/login', {
      method: 'POST',
      body: JSON.stringify({ address, signature, nonce }),
    });
  };

  export const clientLogin = async (baseUrl) => {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];
    const nonce = await getNonce(baseUrl);
  
    const message = `Login for address ${address} with nonce ${nonce}`;
    const signature = await signMessage(message);
  
    return fetchJson(baseUrl, '/clients/login', {
      method: 'POST',
      body: JSON.stringify({ address, signature, nonce }),
    });
  }
  
  export const createPaymentIntent = async (baseUrl, { to, amount, token, chainId, extId, merchantId }) => {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const from = accounts[0];
  
    const message = `Create payment intent: to=${to} amount=${amount} token=${token} chainId=${chainId} extId=${extId}`;
    const signature = await signMessage(message);
  
    return fetchJson(baseUrl, '/payment-intents', {
      method: 'POST',
      body: JSON.stringify({
        to,
        amount,
        token,
        chainId,
        extId,
        merchantId,
        from,
        signature,
      }),
    });
  };
  
  export const cancelPaymentIntent = async (baseUrl, id) => {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const from = accounts[0];
  
    const message = `Cancel payment intent ${id}`;
    const signature = await signMessage(message);
  
    return fetchJson(baseUrl, `/payment-intents/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ from, signature }),
    });
  };

  export const payPaymentIntent = async (baseUrl, { paymentIntent }) => {
    if (!window.ethereum) throw new Error('Ethereum provider not found');
  
    const tx = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: paymentIntent.from,
        to: paymentIntent.token, // token contract address
        data: generateERC20TransferData(paymentIntent.to, paymentIntent.amount),
        value: '0x0'
      }]
    });
  
    return tx;
  };

  export const getClientPayments = async (baseUrl) => {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const from = accounts[0];
    return fetchJson(baseUrl, `/client/payments/${from}`);
  }
  
  // Utility function to generate ERC20 transfer data
  function generateERC20TransferData(to, amount) {
    // ERC20 transfer function signature + encoded parameters
    const functionSignature = '0xa9059cbb';
    const paddedAddress = to.slice(2).padStart(64, '0');
    const paddedAmount = amount.toString(16).padStart(64, '0');
    return `${functionSignature}${paddedAddress}${paddedAmount}`;
  }
  
  export const getMerchantPayments = async (baseUrl, token) => {
    return fetchJson(baseUrl, '/payments', { token });
  };

export const subscribeToClientPayments = (baseUrl, jwtToken) =>{
    const eventSource = new EventSource(`${baseUrl}/client/payments/updates`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`
      }
    });

    eventSource.onmessage = (event) => {
      const payment = JSON.parse(event.data);
      console.log('Received payment:', payment);
      payment;
    };
}
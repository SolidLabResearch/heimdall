const N3 = require('n3');
const authn = require('@inrupt/solid-client-authn-core')
import { Session } from "@rubensworks/solid-client-authn-isomorphic";
/**
 * @typedef {object} CredentialsToken
 * @property {string} id - The token id.
 * @property {string} secret - The token secret.
 * @property {string} idp - The Identity Provider that granted the token.
 */
/**
 * Create a client credentials token for CSS v4.0.0 and higher.
 * @param {object} options - Token creation options.
 * @param {string} options.name - The name for the token.
 * @param {string} options.webid - The user WebID.
 * @param {string} options.email - The user email.
 * @param {string} options.password - The user password.
 * @returns {CredentialsToken} - The resulting Client Credentials Token.
 */
async function createAuthenticationTokenCSS(options: any) {
    options.idp = await getIdpFromWebID(options);
    const { id, secret } = await generateToken(options);
    return { id, secret, idp: options.idp }
}

/**
 * Get the Identity Provider from a WebID.
 * @param {any} options - The options for the token generation.
 * @returns {Promise<string>} - The resulting Identity Provider.
 */
async function getIdpFromWebID(options: any) {
    const parser = new N3.Parser({ baseIRI: options.webid });
    const idps = []

    const res = await fetch(options.webid, { headers: { 'Accept': 'text/turtle' } });
    const resText = await res.text();
    const quads = await parser.parse(resText)

    for (const quad of quads) {
        if (quad.predicate.value === "http://www.w3.org/ns/solid/terms#oidcIssuer" && quad.subject.value === options.webid) {
            idps.push(quad.object.value);
        }
    }

    if (idps.length === 0)
        throw new Error('No identity provider link found in WebID. This is mandatory by the Solid specification.')
    if (idps.length > 1)
        throw new Error('Multiple IDPs is not supported yet.')
    return idps[0]
}

/**
 * Generate a authentication token from the IDP of the Community Solid Server.
 * @param {any} options - The options for the token generation.
 * @returns {Promise<CredentialsToken>} - The resulting token.
 */
export async function generateToken(options: any) {
    // This assumes your server is started under http://localhost:3000/.
    // This URL can also be found by checking the controls in JSON responses when interacting with the IDP API,
    // as described in the Identity Provider section.
    const response = await fetch(`${options.idp}idp/credentials/`, { // TODO:: this link can be discovered from the .well-known file as well.
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The email/password fields are those of your account.
        // The name field will be used when generating the ID of your token.
        body: JSON.stringify({ email: options.email, password: options.password, name: options.name }),
    });

    // These are the identifier and secret of your token.
    const tokenresponse = await response.json()
    if (!tokenresponse.id || !tokenresponse.secret) {
        throw new Error(`Could not generate client credentials: ${tokenresponse.statusCode} - ${tokenresponse.name}}. Please check the provided email and password.`)
    }
    return tokenresponse
}

/*********
 * Fetch *
 *********/

/**
 * Create an authenticated fetch function using a file with a CSS client credentials token for CSS v4.0.0 and higher.
 * @param {CredentialsToken} credentials - Client Credentials Token.
 * @param {Function} [fetch] - Optional fetch function to authenticate. Defaults to built-in fetch function.
 * @returns {Function} - The authenticated fetch function.
 */
async function makeAuthenticatedFetch(credentials: any, fetch: any) {
    const authFetch = await createAuthenticatedFetchFunction(credentials, fetch);
    return authFetch
}

/**
 * Create an authenticated fetch function using a file with a CSS client credentials token for CSS v4.0.0 and higher.
 * @param {any} credentials - Client Credentials Token.
 * @param {any} passedFetch - Optional fetch function to authenticate. Defaults to built-in fetch function.
 * @returns {Promise<Function>} - The authenticated fetch function.
 */
async function createAuthenticatedFetchFunction(credentials: any, passedFetch: any) {
    const { id, secret, idp } = credentials;
    const fetchFunction = passedFetch || fetch

    // A key pair is needed for encryption.
    // This function from `solid-client-authn` generates such a pair for you.
    const dpopKey = await authn.generateDpopKeyPair();

    // These are the ID and secret generated in the previous step.
    // Both the ID and the secret need to be form-encoded.
    const authString = `${encodeURIComponent(id)}:${encodeURIComponent(secret)}`;
    // This URL can be found by looking at the "token_endpoint" field at
    // http://localhost:3000/.well-known/openid-configuration
    // if your server is hosted at http://localhost:3000/.
    const tokenUrl = `${idp}.oidc/token`;
    const response = await fetchFunction(tokenUrl, {
        method: 'POST',
        headers: {
            // The header needs to be in base64 encoding.
            authorization: `Basic ${Buffer.from(authString).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
            dpop: await authn.createDpopHeader(tokenUrl, 'POST', dpopKey),
        },
        body: 'grant_type=client_credentials&scope=webid',
    });

    // This is the Access token that will be used to do an authenticated request to the server.
    // The JSON also contains an "expires_in" field in seconds,
    // which you can use to know when you need request a new Access token.
    const { access_token: accessToken } = await response.json();

    // The DPoP key needs to be the same key as the one used in the previous step.
    // The Access token is the one generated in the previous step.
    const authFetch = await authn.buildAuthenticatedFetch(fetchFunction, accessToken, { dpopKey });
    // authFetch can now be used as a standard fetch function that will authenticate as your WebID.
    // This request will do a simple GET for example.
    return authFetch
}
/**
 * Create a session with a file with a CSS client credentials token for CSS v4.0.0 and higher.
 * @param {any} credentials - Client Credentials Token.
 * @returns {Promise<Session>} - The resulting session.
 */
export async function session_with_credentials(credentials: any): Promise<Session> {
    const session = new Session();
    session.fetch = await makeAuthenticatedFetch(credentials, fetch);
    session.info.isLoggedIn = true;
    return session
}

module.exports = { createAuthenticationTokenCSS, makeAuthenticatedFetch, session_with_credentials, generateToken }

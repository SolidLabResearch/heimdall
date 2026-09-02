import { LDPCommunication, SolidCommunication } from '@treecg/versionawareldesinldp';
import { loadOptionalSourcePodCredentials, SourcePodCredentials } from '../../config/privateCredentials';
import { session_with_credentials } from '../../utils/authentication/CSSAuthentication';

export type SourceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type SourcePodSessionFactory = (credentials: { id: string; secret: string; idp: string }) => Promise<any>;

/** Resolves optional source-Pod credentials once and reuses one session per configured source. */
export class SourcePodAccess {
    private readonly credentials: SourcePodCredentials;
    private readonly sessions = new Map<string, Promise<any>>();

    public constructor(credentials: SourcePodCredentials = loadOptionalSourcePodCredentials(), private readonly createSession: SourcePodSessionFactory = session_with_credentials) {
        this.credentials = credentials;
    }

    public hasCredentials(resourceUrl: string): boolean {
        return this.credentialKey(resourceUrl) !== undefined;
    }

    public async fetchFor(resourceUrl: string): Promise<SourceFetch> {
        const key = this.credentialKey(resourceUrl);
        if (!key) return fetch;
        const session = await this.sessionFor(key);
        return session.fetch as SourceFetch;
    }

    public async communicationFor(resourceUrl: string): Promise<SolidCommunication | LDPCommunication> {
        const key = this.credentialKey(resourceUrl);
        return key ? new SolidCommunication(await this.sessionFor(key)) : new LDPCommunication();
    }

    private credentialKey(resourceUrl: string): string | undefined {
        const matches = Object.keys(this.credentials).filter((configuredUrl) => {
            try {
                return new URL(resourceUrl).toString().startsWith(new URL(configuredUrl).toString());
            } catch (_) {
                return resourceUrl === configuredUrl;
            }
        });
        return matches.sort((a, b) => b.length - a.length)[0];
    }

    private sessionFor(key: string): Promise<any> {
        let session = this.sessions.get(key);
        if (!session) {
            const credentials = this.credentials[key];
            if (!credentials || !credentials.id || !credentials.secret || !credentials.idp) {
                throw new Error(`Invalid source-Pod credentials configured for ${key}; expected id, secret, and idp.`);
            }
            session = this.createSession(credentials);
            this.sessions.set(key, session);
        }
        return session;
    }
}

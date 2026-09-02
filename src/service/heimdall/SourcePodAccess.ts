import { LDPCommunication, SolidCommunication } from '@treecg/versionawareldesinldp';
import { loadOptionalSourcePodCredentials, SourcePodCredentials } from '../../config/privateCredentials';
import { session_with_credentials } from '../../utils/authentication/CSSAuthentication';

export type SourceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type SourcePodSessionFactory = (credentials: { id: string; secret: string; idp: string }, allowedOrigin?: string) => Promise<any>;

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

    public async fetchFor(resourceUrl: string, sourceResourceUrl = resourceUrl): Promise<SourceFetch> {
        let key = this.credentialKey(resourceUrl);
        // A stream entry may intentionally cover same-origin discovered
        // resources (inbox/subscription server). Never carry it across origins.
        if (!key && this.sameOrigin(resourceUrl, sourceResourceUrl)) key = this.credentialKey(sourceResourceUrl);
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
                const resource = new URL(resourceUrl);
                const configured = new URL(configuredUrl);
                if (resource.origin !== configured.origin) return false;
                const configuredPath = configured.pathname.replace(/\/+$/, '') || '/';
                const resourcePath = resource.pathname;
                return configuredPath === '/'
                    ? resourcePath.startsWith('/')
                    : resourcePath === configuredPath || resourcePath.startsWith(`${configuredPath}/`);
            } catch (_) {
                return resourceUrl === configuredUrl;
            }
        });
        return matches.sort((a, b) => b.length - a.length)[0];
    }

    private sameOrigin(left: string, right: string): boolean {
        try {
            return new URL(left).origin === new URL(right).origin;
        } catch (_) {
            return false;
        }
    }

    private sessionFor(key: string): Promise<any> {
        let session = this.sessions.get(key);
        if (!session) {
            const credentials = this.credentials[key];
            if (!credentials || !credentials.id || !credentials.secret || !credentials.idp) {
                throw new Error(`Invalid source-Pod credentials configured for ${key}; expected id, secret, and idp.`);
            }
            let allowedOrigin: string;
            try {
                allowedOrigin = new URL(key).origin;
            } catch (_) {
                throw new Error(`Invalid source-Pod credential URL ${key}; expected an absolute URL.`);
            }
            const pending = this.createSession(credentials, allowedOrigin);
            session = pending.catch((error: unknown) => {
                if (this.sessions.get(key) === session) this.sessions.delete(key);
                throw error;
            });
            this.sessions.set(key, session);
        }
        return session;
    }
}

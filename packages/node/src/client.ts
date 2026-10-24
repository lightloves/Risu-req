import { ConnectionPool } from "./pool.js";
import { CookieJar } from "./cookies.js";
import { executeRequestPipeline } from "./request.js";
import type { RisuResponse } from "./response.js";
import type {
  ClientOptions,
  RequestOptions,
  CookieJarLike,
} from "./types.js";

export class RisuClient {
  readonly options: ClientOptions;
  readonly cookieJar?: CookieJarLike;
  private readonly pool: ConnectionPool;
  private isClosed = false;

  constructor(options: ClientOptions = {}) {
    this.options = { ...options };
    this.pool = new ConnectionPool(options.pool, options.tls);

    if (options.cookies === true) {
      this.cookieJar = new CookieJar();
    } else if (typeof options.cookies === "object" && options.cookies !== null) {
      this.cookieJar = options.cookies;
    }
  }

  async request(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    if (this.isClosed) {
      throw new Error("RisuClient has been closed");
    }

    return executeRequestPipeline(
      url,
      options,
      this.options,
      this.pool,
      this.cookieJar
    );
  }

  async get(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.request(url, { ...options, method: "GET" });
  }

  async post(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.request(url, { ...options, method: "POST" });
  }

  async put(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.request(url, { ...options, method: "PUT" });
  }

  async patch(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.request(url, { ...options, method: "PATCH" });
  }

  async delete(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.request(url, { ...options, method: "DELETE" });
  }

  async del(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.delete(url, options);
  }

  async head(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.request(url, { ...options, method: "HEAD" });
  }

  async optionsMethod(url: string, options: RequestOptions = {}): Promise<RisuResponse> {
    return this.request(url, { ...options, method: "OPTIONS" });
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.pool.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

let defaultGlobalClient: RisuClient | null = null;

function getDefaultClient(): RisuClient {
  if (!defaultGlobalClient) {
    defaultGlobalClient = new RisuClient();
  }
  return defaultGlobalClient;
}

export function createClient(options?: ClientOptions): RisuClient {
  return new RisuClient(options);
}

export async function request(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().request(url, options);
}

export async function get(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().get(url, options);
}

export async function post(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().post(url, options);
}

export async function put(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().put(url, options);
}

export async function patch(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().patch(url, options);
}

export async function del(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().del(url, options);
}

export { del as delete };

export async function head(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().head(url, options);
}

export async function options(url: string, options?: RequestOptions): Promise<RisuResponse> {
  return getDefaultClient().optionsMethod(url, options);
}

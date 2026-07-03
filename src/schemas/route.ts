import { Static, TSchema } from "@sinclair/typebox";
import { RouteGenericInterface } from "fastify";

type StaticOf<S> = S extends TSchema ? Static<S> : unknown;

export type Route<
  S extends {
    body?: TSchema;
    params?: TSchema;
    querystring?: TSchema;
  },
> = RouteGenericInterface & {
  Body: StaticOf<S["body"]>;
  Params: StaticOf<S["params"]>;
  Querystring: StaticOf<S["querystring"]>;
};

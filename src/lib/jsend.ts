import { Static, TSchema, Type } from "@sinclair/typebox";

// --- Runtime JSend response builders (from utils/jsend.ts) ---

type JSendSuccessBody<T> = {
  status: "success";
  data: T;
};

type JSendFailBody<T> = {
  status: "fail";
  data: T;
};

type JSendErrorBody = {
  status: "error";
  message: string;
};

export const createErrorResponse = (message: string): JSendErrorBody => {
  return {
    status: "error",
    message,
  };
};

export const createFailResponse = <T>(data: T): JSendFailBody<T> => {
  return {
    status: "fail",
    data,
  };
};

export const createSuccessResponse = <T>(data: T): JSendSuccessBody<T> => {
  return {
    status: "success",
    data,
  };
};

// --- TypeBox JSend response schemas (from schemas/jsend.ts) ---

export function SuccessResponse<T extends TSchema>(dataSchema: T) {
  return Type.Object({
    status: Type.Literal("success"),
    data: Type.Union([dataSchema, Type.Null()]),
  });
}

export function FailResponse<T extends TSchema>(dataSchema: T) {
  return Type.Object({
    status: Type.Literal("fail"),
    data: dataSchema,
  });
}

export const UnknownData = Type.Unknown();

// Documents a non-JSON binary response (e.g. a streamed file download) for
// OpenAPI. It carries no JSON schema, so Fastify streams the body through
// untouched instead of trying to serialise it as JSON.
export const BinaryResponse = (mediaType: string, description: string) => ({
  description,
  content: {
    [mediaType]: {
      schema: { type: "string", format: "binary" },
    },
  },
});

const ERROR_RESPONSE_ID = "JSendError";

export const ErrorResponse = Type.Object(
  {
    status: Type.Literal("error"),
    message: Type.String(),
    code: Type.Optional(Type.Integer()),
    data: Type.Optional(Type.Unknown()),
  },
  { $id: ERROR_RESPONSE_ID },
);

export type JSendError = Static<typeof ErrorResponse>;

export const ErrorResponseRef = Type.Unsafe<JSendError>(
  Type.Ref(ERROR_RESPONSE_ID),
);

export function JSendResponseSchema<
  SuccessData extends TSchema,
  FailData extends TSchema,
>(successDataSchema: SuccessData, failDataSchema: FailData) {
  return Type.Union([
    SuccessResponse(successDataSchema),
    FailResponse(failDataSchema),
    ErrorResponseRef,
  ]);
}

export type JSendResponse<
  TSuccess extends TSchema,
  TFail extends TSchema | undefined = undefined,
> =
  | Static<ReturnType<typeof SuccessResponse<TSuccess>>>
  | (TFail extends TSchema
      ? Static<ReturnType<typeof FailResponse<TFail>>>
      : never);

export type JSendFail<TFail extends TSchema> = Static<
  ReturnType<typeof FailResponse<TFail>>
>;

// --- Shared permission-fail schema (from schemas/responses.ts) ---

export const RequestPermissionsFail = Type.Object({
  permissions: Type.String(),
});

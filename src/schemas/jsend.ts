import { Static, TSchema, Type } from "@sinclair/typebox";

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

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

export const ErrorResponse = Type.Object({
  status: Type.Literal("error"),
  message: Type.String(),
  code: Type.Optional(Type.Integer()),
  data: Type.Optional(Type.Unknown()),
});

export function JSendResponseSchema<
  SuccessData extends TSchema,
  FailData extends TSchema,
>(successDataSchema: SuccessData, failDataSchema: FailData) {
  return Type.Union([
    SuccessResponse(successDataSchema),
    FailResponse(failDataSchema),
    ErrorResponse,
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

export type JSendError = Static<typeof ErrorResponse>;

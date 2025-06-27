type JSendSuccess<T> = {
  status: "success";
  data: T;
};

type JSendFail<T> = {
  status: "fail";
  data: T;
};

type JSendError = {
  status: "error";
  message: string;
};

export const createErrorResponse = (message: string): JSendError => {
  return {
    status: "error",
    message,
  };
};

export const createFailResponse = <T>(data: T): JSendFail<T> => {
  return {
    status: "fail",
    data,
  };
};

export const createSuccessResponse = <T>(data: T): JSendSuccess<T> => {
  return {
    status: "success",
    data,
  };
};

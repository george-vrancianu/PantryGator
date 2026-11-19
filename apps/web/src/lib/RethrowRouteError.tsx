import { useRouteError } from 'react-router-dom';

/**
 * A route `errorElement` that throws the route's error again, so a render crash
 * propagates as it did under `BrowserRouter` instead of showing React Router's
 * default English "Unexpected Application Error!" screen with the stack.
 */
export function RethrowRouteError(): never {
  throw useRouteError();
}

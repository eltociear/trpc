import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
} from '@trpc/server';
import { observable } from '../rx/observable';
import { Operation, OperationResult, TRPCLink } from './core';

type ConsoleEsque = {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

type EnableFnOptions<TRouter extends AnyRouter> =
  | (Operation & {
      direction: 'up';
    })
  | {
      direction: 'down';
      result: OperationResult<TRouter, unknown>;
    };
type EnabledFn<TRouter extends AnyRouter> = (
  opts: EnableFnOptions<TRouter>,
) => boolean;

type LogFnOptions<TRouter extends AnyRouter> = Operation &
  (
    | {
        /**
         * Request was just initialized
         */
        direction: 'up';
      }
    | {
        /**
         * Request result
         */
        direction: 'down';
        result: OperationResult<TRouter, unknown>;
        elapsedMs: number;
      }
  );
type LogFn<TRouter extends AnyRouter> = (opts: LogFnOptions<TRouter>) => void;

const palette = {
  query: ['72e3ff', '3fb0d8'],
  mutation: ['c5a3fc', '904dfc'],
  subscription: ['ff49e1', 'd83fbe'],
};
type LoggerLinkOptions<TRouter extends AnyRouter> = {
  logger?: LogFn<TRouter>;
  enabled?: EnabledFn<TRouter>;
  /**
   * Used in the built-in defaultLogger
   */
  console?: ConsoleEsque;
};

// maybe this should be moved to it's own package
const defaultLogger =
  <TRouter extends AnyRouter>(c: ConsoleEsque = console): LogFn<TRouter> =>
  (props) => {
    const { direction, input, type, path, meta, id } = props;
    const [light, dark] = palette[type];

    const css = `
    background-color: #${direction === 'up' ? light : dark}; 
    color: ${direction === 'up' ? 'black' : 'white'};
    padding: 2px;
  `;

    const parts = [
      '%c',
      direction === 'up' ? '>>' : '<<',
      type,
      `#${id}`,
      `%c${path}%c`,
      '%O',
    ];
    const args: any[] = [
      css,
      `${css}; font-weight: bold;`,
      `${css}; font-weight: normal;`,
    ];
    if (props.direction === 'up') {
      args.push({ input, meta });
    } else {
      args.push({
        input,
        result: props.result,
        elapsedMs: props.elapsedMs,
        meta,
      });
    }
    const fn: 'error' | 'log' =
      props.direction === 'down' &&
      props.result &&
      (props.result instanceof Error || 'error' in props.result.data)
        ? 'error'
        : 'log';

    c[fn].apply(null, [parts.join(' ')].concat(args));
  };
export function loggerLink<TRouter extends AnyRouter = AnyRouter>(
  opts: LoggerLinkOptions<TRouter> = {},
): TRPCLink<TRouter> {
  const { enabled = () => true } = opts;

  const { logger = defaultLogger(opts.console) } = opts;

  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        // ->
        enabled({ ...op, direction: 'up' }) &&
          logger({
            ...op,
            direction: 'up',
          });
        const requestStartTime = Date.now();
        const next$ = next(op).subscribe({
          next(value) {
            const elapsedMs = Date.now() - requestStartTime;

            enabled({ ...op, direction: 'down', result: value }) &&
              logger({
                ...op,
                direction: 'down',
                elapsedMs,
                result: value,
              });
          },
          error(err) {
            observer.error(err);
          },
          complete: observer.complete,
        });
        return next$;
      });
    };
  };
}
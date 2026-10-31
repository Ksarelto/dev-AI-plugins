export function InlineError({ message }: { message: string }) {
  return <p role="alert">{message}</p>;
}

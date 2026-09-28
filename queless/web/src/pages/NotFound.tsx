import { Container } from '../components/Layout';
import { ButtonLink } from '../components/ui';

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-28 text-center">
      <p className="display text-8xl">404</p>
      <p className="lede mt-3 text-xl">This page left the queue.</p>
      <ButtonLink to="/" variant="primary" size="lg" className="mt-8">Back home</ButtonLink>
    </Container>
  );
}

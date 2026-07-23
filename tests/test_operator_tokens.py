import unittest
from hashlib import sha256

from app.operator_tokens import generate_operator_token


class OperatorTokenTests(unittest.TestCase):
    def test_generated_token_has_high_entropy_length_and_matching_hash(self):
        token, token_hash = generate_operator_token()

        self.assertGreaterEqual(len(token), 43)
        self.assertEqual(token_hash, sha256(token.encode("utf-8")).hexdigest())


if __name__ == "__main__":
    unittest.main()

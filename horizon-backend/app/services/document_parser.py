
import re


class DocumentParser:

    @staticmethod
    def extract_fields(text: str):

        fields = {}

        name_match = re.search(
            r"Name.*?:\s*([A-Za-z ]+)",
            text,
            re.IGNORECASE
        )

        if name_match:
            fields["name"] = name_match.group(1).strip()

        return fields
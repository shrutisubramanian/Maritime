import re


class DocumentParser:

    @staticmethod
    def extract_fields(text: str):

        fields = {}

        lines = text.split("\n")

        for line in lines:

            if "name" in line.lower():

                parts = line.split(":")

                if len(parts) > 1:
                    fields["holder_name"] = parts[-1].strip()

        return fields
#!/usr/bin/env python3

import os
import re

def remove_component_div(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.tsx'):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Remove component="div" from Grid items
                    updated_content = re.sub(r' component="div"', '', content)
                    
                    if content != updated_content:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(updated_content)
                        print(f"Updated: {file_path}")
                    
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

if __name__ == "__main__":
    remove_component_div("src")
    print("Done removing component='div' from all Grid items!")

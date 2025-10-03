function runTest() {
    const testHtml = document.getElementById('testHtml');
    const resultDiv = document.getElementById('result');
    
    try {
        const html = testHtml.innerHTML;
        const markdown = convertHtmlToMarkdown(html);
        resultDiv.textContent = markdown;
        resultDiv.style.background = '#f5f5f5';
    } catch (error) {
        resultDiv.textContent = 'Error: ' + error.message + '\n\n' + error.stack;
        resultDiv.style.background = '#ffebee';
    }
}

function convertHtmlToMarkdown(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return processChildren(tempDiv);
}

function nodeToMarkdown(node, indent = '') {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
        const elem = node;
        const tagName = elem.tagName.toLowerCase();
        
        if (tagName === 'table') {
            return processTable(elem);
        }
        
        if (tagName === 'b' || tagName === 'strong') {
            return '**' + processChildren(elem, indent) + '**';
        }
        
        if (tagName === 'div') {
            return processChildren(elem, indent);
        }
        
        return processChildren(elem, indent);
    }
    
    return '';
}

function processChildren(elem, indent = '') {
    let result = '';
    for (const child of Array.from(elem.childNodes)) {
        result += nodeToMarkdown(child, indent);
    }
    return result;
}

function processTable(table) {
    const rows = [];
    let hasHeader = false;
    
    // Process thead
    const thead = table.querySelector('thead');
    if (thead) {
        hasHeader = true;
        const headerRows = thead.querySelectorAll('tr');
        headerRows.forEach(tr => {
            const cells = [];
            tr.querySelectorAll('th, td').forEach(cell => {
                const cellContent = getCellContent(cell);
                cells.push(cellContent);
            });
            if (cells.length > 0) {
                rows.push(cells);
            }
        });
    }
    
    // Process tbody
    const tbody = table.querySelector('tbody');
    if (tbody) {
        const bodyRows = tbody.querySelectorAll('tr');
        bodyRows.forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td, th').forEach(cell => {
                const cellContent = getCellContent(cell);
                cells.push(cellContent);
            });
            if (cells.length > 0) {
                rows.push(cells);
            }
        });
    }
    
    // If no thead, check if first row should be header
    if (!hasHeader && rows.length > 0) {
        hasHeader = true;
    }
    
    if (rows.length === 0) {
        return '';
    }
    
    // Build markdown table
    let result = '\n';
    
    // Add header row
    if (hasHeader && rows.length > 0) {
        const headerRow = rows[0];
        result += '| ' + headerRow.join(' | ') + ' |\n';
        
        // Add separator row
        result += '| ' + headerRow.map(() => '---').join(' | ') + ' |\n';
        
        // Add data rows
        for (let i = 1; i < rows.length; i++) {
            result += '| ' + rows[i].join(' | ') + ' |\n';
        }
    } else {
        // No header, all rows are data
        rows.forEach(row => {
            result += '| ' + row.join(' | ') + ' |\n';
        });
    }
    
    result += '\n';
    return result;
}

function getCellContent(cell) {
    let content = '';
    
    // Process child nodes to handle formatting
    for (const child of Array.from(cell.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            content += child.textContent || '';
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const elem = child;
            const tagName = elem.tagName.toLowerCase();
            
            // Handle special elements
            if (tagName === 'strong' || tagName === 'b') {
                content += '**' + (elem.textContent || '') + '**';
            } else if (tagName === 'em' || tagName === 'i') {
                content += '*' + (elem.textContent || '') + '*';
            } else if (tagName === 'code') {
                content += '`' + (elem.textContent || '') + '`';
            } else if (tagName === 'a') {
                const href = elem.getAttribute('href') || '';
                const text = elem.textContent || '';
                content += `[${text}](${href})`;
            } else if (tagName === 'br') {
                content += ' ';
            } else {
                // For other elements, just get text content
                content += elem.textContent || '';
            }
        }
    }
    
    // Clean up the content
    content = content.trim();
    // Replace newlines with spaces in table cells
    content = content.replace(/\n+/g, ' ');
    // Replace multiple spaces with single space
    content = content.replace(/\s+/g, ' ');
    
    return content;
}

// Auto-run on load
window.addEventListener('load', runTest);

